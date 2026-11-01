// Scheduled loyalty work (GET /api/cron/loyalty, run daily or more often). SERVER-ONLY. Every step is idempotent,
// so re-running the job, or two runs overlapping, never awards, expires or notifies twice.

import { prisma } from "@/lib/prisma"
import { reconcileReservation, programStart } from "./earning"
import { postCredit, postDebit, refreshBalanceCache, withMemberLock } from "./ledger"
import { ensureMembership, firstName, recalcTier } from "./members"
import { flushOutbox, retryFailedNotifications, type OutboxItem } from "./notify"
import { EVENT_BONUS_POINTS, EXPIRY_REMINDER_DAYS, istDate, isOccasionToday } from "./rules"

const BATCH = 200

function fmtDate(d: Date) {
  return new Date(d.getTime() + 330 * 60000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

// 1. Enrol guests with bookings who aren't members yet (Star after their first booking).
export async function enrolGuestsWithBookings(now = new Date()): Promise<number> {
  const rows = await prisma.$queryRaw<{ guestId: string; phone: string; name: string }[]>`
    SELECT DISTINCT ON (g."phone") g."id" AS "guestId", g."phone", g."name"
    FROM "Reservation" r JOIN "Guest" g ON g."id" = r."guestId"
    WHERE r."status" <> 'CANCELLED'
      AND NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."phone" = g."phone")
    ORDER BY g."phone", r."createdAt" ASC
    LIMIT ${BATCH}`
  let n = 0
  for (const r of rows) if (await ensureMembership({ phone: r.phone, name: r.name, guestId: r.guestId }, now).catch(() => null)) n++
  return n
}

// 2. Safety net for booking points: completed stays not yet credited, recently changed stays (modifications,
//    refunds) and cancellations that still hold points.
export async function reconcileRecentReservations(now = new Date()) {
  const since = new Date(now.getTime() - 60 * 86400000)
  const start = programStart()
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r."id" FROM "Reservation" r
    WHERE (r."status" = 'CHECKED_OUT' AND r."checkOut" >= ${start}
           AND (r."updatedAt" >= ${since} OR NOT EXISTS (SELECT 1 FROM "PointTransaction" p WHERE p."reservationId" = r."id" AND p."type" = 'EARN_BOOKING')))
       OR (r."status" = 'CANCELLED' AND EXISTS (SELECT 1 FROM "PointTransaction" p WHERE p."reservationId" = r."id"))
    ORDER BY r."updatedAt" DESC
    LIMIT ${BATCH}`
  const counts = { earned: 0, adjusted: 0, reversed: 0 }
  for (const { id } of rows) {
    try {
      const r = await reconcileReservation(id, now)
      if (r.action === "earned" || r.action === "adjusted" || r.action === "reversed") counts[r.action]++
    } catch (e) {
      console.error("[Loyalty] reconcile failed for reservation", id, e)
    }
  }
  return counts
}

// 3. Birthday and anniversary bonuses: once per member, occasion and calendar year (IST).
export async function awardOccasionBonuses(now = new Date()) {
  const today = istDate(now)
  const leapFallback = today.month === 2 && today.day === 28
  const members = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Membership"
    WHERE ("birthday" IS NOT NULL AND ((EXTRACT(MONTH FROM "birthday") = ${today.month} AND EXTRACT(DAY FROM "birthday") = ${today.day})
            OR (${leapFallback} AND EXTRACT(MONTH FROM "birthday") = 2 AND EXTRACT(DAY FROM "birthday") = 29)))
       OR ("anniversary" IS NOT NULL AND ((EXTRACT(MONTH FROM "anniversary") = ${today.month} AND EXTRACT(DAY FROM "anniversary") = ${today.day})
            OR (${leapFallback} AND EXTRACT(MONTH FROM "anniversary") = 2 AND EXTRACT(DAY FROM "anniversary") = 29)))`
  const outbox: OutboxItem[] = []
  let awarded = 0
  for (const { id } of members) {
    await withMemberLock(id, async (tx) => {
      const m = await tx.membership.findUniqueOrThrow({ where: { id } })
      for (const kind of ["BIRTHDAY", "ANNIVERSARY"] as const) {
        const date = kind === "BIRTHDAY" ? m.birthday : m.anniversary
        if (!date || !isOccasionToday(date, now)) continue
        const done = await tx.loyaltyEventReward.findUnique({ where: { membershipId_kind_year: { membershipId: id, kind, year: today.year } } })
        if (done) continue
        const res = await postCredit(tx, {
          membershipId: id, points: EVENT_BONUS_POINTS, type: kind === "BIRTHDAY" ? "BONUS_BIRTHDAY" : "BONUS_ANNIVERSARY",
          description: kind === "BIRTHDAY" ? `Birthday bonus ${today.year}` : `Anniversary bonus ${today.year}`,
          idempotencyKey: `${kind}:${id}:${today.year}`, meta: { actor: "SYSTEM" },
        }, now)
        await tx.loyaltyEventReward.create({ data: { membershipId: id, kind, year: today.year, transactionId: res.entry.id } })
        awarded++
        const summary = await refreshBalanceCache(tx, id, now)
        if (m.phone) {
          outbox.push({
            kind: kind === "BIRTHDAY" ? "BIRTHDAY_BONUS" : "ANNIVERSARY_BONUS", membershipId: id, to: m.phone, dedupeKey: `${kind}_BONUS:${id}:${today.year}`,
            vars: { name: firstName(m.name), points: String(EVENT_BONUS_POINTS), balance: String(Math.max(0, summary.available)) },
          })
        }
      }
    }).catch((e) => console.error("[Loyalty] occasion bonus failed for", id, e))
  }
  await flushOutbox(outbox)
  return awarded
}

// 4. Expire lapsed batches: each batch's unused points get their own EXPIRY row.
export async function expireLapsedPoints(now = new Date()) {
  const rows = await prisma.$queryRaw<{ id: string; membershipId: string }[]>`
    SELECT c."id", c."membershipId" FROM "PointTransaction" c
    LEFT JOIN "PointAllocation" a ON a."creditId" = c."id"
    WHERE c."amount" > 0 AND c."expiresAt" IS NOT NULL AND c."expiresAt" <= ${now}
    GROUP BY c."id"
    HAVING c."amount" - COALESCE(SUM(a."points"), 0) > 0
    ORDER BY c."membershipId"
    LIMIT ${BATCH * 5}`
  const byMember = new Map<string, string[]>()
  for (const r of rows) byMember.set(r.membershipId, [...(byMember.get(r.membershipId) ?? []), r.id])
  const outbox: OutboxItem[] = []
  let expiredPoints = 0
  for (const [memberId, creditIds] of byMember) {
    await withMemberLock(memberId, async (tx) => {
      let total = 0
      for (const creditId of creditIds) {
        const credit = await tx.pointTransaction.findUniqueOrThrow({ where: { id: creditId } })
        const used = await tx.pointAllocation.aggregate({ where: { creditId }, _sum: { points: true } })
        const remaining = credit.amount - (used._sum.points ?? 0)
        if (remaining <= 0) continue
        const res = await postDebit(tx, {
          membershipId: memberId, points: remaining, type: "EXPIRY", description: `${remaining} points expired (credited ${fmtDate(credit.createdAt)})`,
          idempotencyKey: `EXPIRY:${creditId}`, onlyCreditId: creditId, meta: { relatedId: creditId, actor: "SYSTEM" },
        }, now)
        if (res.created) total += remaining
      }
      const summary = await refreshBalanceCache(tx, memberId, now)
      if (total > 0) {
        expiredPoints += total
        const m = await tx.membership.findUniqueOrThrow({ where: { id: memberId } })
        if (m.phone) {
          outbox.push({
            kind: "POINTS_EXPIRED", membershipId: memberId, to: m.phone, dedupeKey: `POINTS_EXPIRED:${memberId}:${istDate(now).iso}`,
            vars: { name: firstName(m.name), points: String(total), balance: String(Math.max(0, summary.available)) },
          })
        }
      }
    }).catch((e) => console.error("[Loyalty] expiry failed for", memberId, e))
  }
  await flushOutbox(outbox)
  return expiredPoints
}

// 5. Reminders 30 days before a batch expires: one message per member and expiry date.
export async function remindExpiringPoints(now = new Date()) {
  const until = new Date(now.getTime() + EXPIRY_REMINDER_DAYS * 86400000)
  const rows = await prisma.$queryRaw<{ membershipId: string; expiresAt: Date; remaining: bigint | number }[]>`
    SELECT c."membershipId", c."expiresAt", c."amount" - COALESCE(SUM(a."points"), 0) AS remaining
    FROM "PointTransaction" c LEFT JOIN "PointAllocation" a ON a."creditId" = c."id"
    WHERE c."amount" > 0 AND c."expiresAt" > ${now} AND c."expiresAt" <= ${until}
    GROUP BY c."id"
    HAVING c."amount" - COALESCE(SUM(a."points"), 0) > 0`
  const groups = new Map<string, { membershipId: string; date: string; expiresAt: Date; points: number }>()
  for (const r of rows) {
    const date = istDate(r.expiresAt).iso
    const key = r.membershipId + "|" + date
    const g = groups.get(key) ?? { membershipId: r.membershipId, date, expiresAt: r.expiresAt, points: 0 }
    g.points += Number(r.remaining)
    groups.set(key, g)
  }
  if (!groups.size) return 0
  const members = await prisma.membership.findMany({ where: { id: { in: [...new Set([...groups.values()].map((g) => g.membershipId))] } }, select: { id: true, phone: true, name: true } })
  const byId = new Map(members.map((m) => [m.id, m]))
  const outbox: OutboxItem[] = []
  for (const g of groups.values()) {
    const m = byId.get(g.membershipId)
    if (!m?.phone) continue
    outbox.push({
      kind: "POINTS_EXPIRING", membershipId: m.id, to: m.phone, dedupeKey: `POINTS_EXPIRING:${m.id}:${g.date}`,
      vars: { name: firstName(m.name), points: String(g.points), expiry_date: fmtDate(g.expiresAt) },
    })
  }
  const r = await flushOutbox(outbox)
  return r.sent
}

// 6. Rolling tier re-evaluation (upgrades and downgrades as the 6-month window moves), and ending manual overrides.
export async function recalculateTiers(now = new Date()) {
  const startOfDay = new Date(now.getTime() - 20 * 3600000)
  const members = await prisma.membership.findMany({
    where: { OR: [{ tierEvaluatedAt: null }, { tierEvaluatedAt: { lt: startOfDay } }, { tierOverrideUntil: { lte: now } }] },
    select: { id: true }, take: BATCH * 5, orderBy: { tierEvaluatedAt: { sort: "asc", nulls: "first" } },
  })
  let changed = 0
  for (const { id } of members) {
    const outbox: OutboxItem[] = []
    await withMemberLock(id, async (tx) => {
      await refreshBalanceCache(tx, id, now)
      const r = await recalcTier(tx, id, now, outbox)
      if (r.from !== r.to) changed++
    }).catch((e) => console.error("[Loyalty] tier recalculation failed for", id, e))
    await flushOutbox(outbox)
  }
  return changed
}

export async function runLoyaltyJobs(now = new Date()) {
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | string> => {
    try {
      return await fn()
    } catch (e) {
      console.error("[Loyalty job] " + name, e)
      return "error: " + (e instanceof Error ? e.message : String(e))
    }
  }
  return {
    enrolled: await step("enrol", () => enrolGuestsWithBookings(now)),
    bookings: await step("bookings", () => reconcileRecentReservations(now)),
    occasionBonuses: await step("occasions", () => awardOccasionBonuses(now)),
    expiredPoints: await step("expiry", () => expireLapsedPoints(now)),
    expiryReminders: await step("reminders", () => remindExpiringPoints(now)),
    tierChanges: await step("tiers", () => recalculateTiers(now)),
    notificationRetries: await step("retries", () => retryFailedNotifications(now)),
  }
}

