// Read models for the admin Loyalty section, CSV export and the member portal. SERVER-ONLY.

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getPointsSummary, loadLedger } from "./ledger"
import { memberReservationWhere, qualifyingSpend } from "./members"
import {
  classifyChannel, creditRemaining, eligibleAmount, EXPIRY_REMINDER_DAYS, isCreditLive, isTier, nextTierProgress, toDateOnlyString, type Tier,
} from "./rules"

export interface MemberFilters {
  q?: string
  tier?: string
  propertyId?: string
  joinedFrom?: string
  joinedTo?: string
  minPoints?: string
  maxPoints?: string
}

export function memberWhere(f: MemberFilters): Prisma.MembershipWhereInput {
  const and: Prisma.MembershipWhereInput[] = []
  const q = (f.q ?? "").trim()
  if (q) {
    const digits = q.replace(/\D/g, "")
    const or: Prisma.MembershipWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { membershipNumber: { contains: q, mode: "insensitive" } },
      { referralCode: { equals: q.toUpperCase() } },
      { guest: { name: { contains: q, mode: "insensitive" } } },
    ]
    if (digits.length >= 4) or.push({ phone: { contains: digits } })
    and.push({ OR: or })
  }
  if (f.tier && isTier(f.tier)) and.push({ tier: f.tier })
  if (f.propertyId && f.propertyId !== "ALL") {
    and.push({ OR: [{ guest: { reservations: { some: { propertyId: f.propertyId } } } }, { transactions: { some: { propertyId: f.propertyId } } }] })
  }
  const from = /^\d{4}-\d{2}-\d{2}$/.test(f.joinedFrom ?? "") ? new Date(f.joinedFrom + "T00:00:00+05:30") : null
  const to = /^\d{4}-\d{2}-\d{2}$/.test(f.joinedTo ?? "") ? new Date(f.joinedTo + "T23:59:59+05:30") : null
  if (from || to) and.push({ joinedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } })
  const min = f.minPoints !== undefined && f.minPoints !== "" ? Number(f.minPoints) : NaN
  const max = f.maxPoints !== undefined && f.maxPoints !== "" ? Number(f.maxPoints) : NaN
  if (Number.isFinite(min) || Number.isFinite(max)) and.push({ points: { ...(Number.isFinite(min) ? { gte: min } : {}), ...(Number.isFinite(max) ? { lte: max } : {}) } })
  return and.length ? { AND: and } : {}
}

export interface MemberRow {
  id: string
  name: string
  phone: string | null
  membershipNumber: string | null
  tier: Tier
  points: number
  qualifyingSpend: number
  joinedAt: string
  lastStay: string | null
}

export async function listMembers(f: MemberFilters, take = 200, skip = 0) {
  const where = memberWhere(f)
  const [rows, total] = await Promise.all([
    prisma.membership.findMany({ where, orderBy: [{ points: "desc" }, { joinedAt: "desc" }], take, skip, include: { guest: { select: { name: true } } } }),
    prisma.membership.count({ where }),
  ])
  const phones = rows.map((r) => r.phone).filter((p): p is string => !!p)
  const last = phones.length
    ? await prisma.$queryRaw<{ phone: string; last: Date }[]>`
        SELECT g."phone", MAX(r."checkOut") AS last FROM "Reservation" r JOIN "Guest" g ON g."id" = r."guestId"
        WHERE r."status" = 'CHECKED_OUT' AND g."phone" = ANY(${phones}) GROUP BY g."phone"`
    : []
  const lastBy = new Map(last.map((l) => [l.phone, l.last]))
  const out: MemberRow[] = rows.map((m) => ({
    id: m.id,
    name: m.name || m.guest?.name || "Member",
    phone: m.phone,
    membershipNumber: m.membershipNumber,
    tier: isTier(m.tier) ? m.tier : "STAR",
    points: m.points,
    qualifyingSpend: m.qualifyingSpend,
    joinedAt: m.joinedAt.toISOString(),
    lastStay: m.phone && lastBy.get(m.phone) ? lastBy.get(m.phone)!.toISOString() : null,
  }))
  return { rows: out, total }
}

export async function loyaltyOverview(now = new Date()) {
  const soon = new Date(now.getTime() + EXPIRY_REMINDER_DAYS * 86400000)
  const [byTier, outstanding, expiring] = await Promise.all([
    prisma.membership.groupBy({ by: ["tier"], _count: { _all: true } }),
    prisma.membership.aggregate({ _sum: { points: true } }),
    upcomingExpirations(now, soon, 50),
  ])
  const counts: Record<string, number> = { STAR: 0, ROCKSTAR: 0, SUPERSTAR: 0 }
  for (const t of byTier) counts[isTier(t.tier) ? t.tier : "STAR"] += t._count._all
  return { counts, totalMembers: Object.values(counts).reduce((a, b) => a + b, 0), outstandingPoints: Math.max(0, outstanding._sum.points ?? 0), expiring }
}

export async function upcomingExpirations(now: Date, until: Date, limit = 100) {
  const rows = await prisma.$queryRaw<{ membershipId: string; name: string | null; membershipNumber: string | null; expiresAt: Date; remaining: bigint | number }[]>`
    SELECT c."membershipId", m."name", m."membershipNumber", c."expiresAt", c."amount" - COALESCE(SUM(a."points"), 0) AS remaining
    FROM "PointTransaction" c
    JOIN "Membership" m ON m."id" = c."membershipId"
    LEFT JOIN "PointAllocation" a ON a."creditId" = c."id"
    WHERE c."amount" > 0 AND c."expiresAt" > ${now} AND c."expiresAt" <= ${until}
    GROUP BY c."id", m."name", m."membershipNumber"
    HAVING c."amount" - COALESCE(SUM(a."points"), 0) > 0
    ORDER BY c."expiresAt" ASC
    LIMIT ${limit}`
  return rows.map((r) => ({ membershipId: r.membershipId, name: r.name || "Member", membershipNumber: r.membershipNumber, expiresAt: r.expiresAt.toISOString(), points: Number(r.remaining) }))
}

// Everything about one member, for the admin profile and (reduced) for the member portal.
export async function memberDetail(id: string, now = new Date()) {
  const m = await prisma.membership.findUnique({ where: { id }, include: { guest: { select: { id: true, name: true, email: true } } } })
  if (!m) return null
  const [spend, summary, ledger, reservations, entries, redemptions, referralsMade, referredVia, tierHistory, auditLog, notifications] = await Promise.all([
    qualifyingSpend(prisma, m, now),
    getPointsSummary(m.id, now),
    loadLedger(prisma, m.id),
    prisma.reservation.findMany({
      where: memberReservationWhere(m), orderBy: { checkIn: "desc" }, take: 100,
      include: { property: { select: { name: true } }, unit: { select: { name: true } } },
    }),
    prisma.pointTransaction.findMany({ where: { membershipId: m.id }, orderBy: { createdAt: "desc" }, take: 300, include: { property: { select: { name: true } } } }),
    prisma.redemption.findMany({ where: { membershipId: m.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.referral.findMany({ where: { referrerId: m.id }, orderBy: { createdAt: "desc" }, include: { referee: { select: { name: true, membershipNumber: true } } } }),
    prisma.referral.findUnique({ where: { refereeId: m.id }, include: { referrer: { select: { name: true, membershipNumber: true } } } }),
    prisma.memberTierHistory.findMany({ where: { membershipId: m.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.loyaltyAuditLog.findMany({ where: { membershipId: m.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.loyaltyNotification.findMany({ where: { membershipId: m.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, kind: true, status: true, attempts: true, lastError: true, createdAt: true } }),
  ])
  const tier: Tier = isTier(m.tier) ? m.tier : "STAR"
  const pointsByReservation = new Map<string, number>()
  for (const e of entries) if (e.reservationId && ["EARN_BOOKING", "BOOKING_ADJUSTMENT", "BOOKING_REVERSAL"].includes(e.type)) pointsByReservation.set(e.reservationId, (pointsByReservation.get(e.reservationId) ?? 0) + e.amount)
  const batches = ledger.credits
    .filter((c) => creditRemaining(c) > 0 && isCreditLive(c, now))
    .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0))
    .map((c) => ({ id: c.id, points: creditRemaining(c), credited: c.amount, expiresAt: c.expiresAt?.toISOString() ?? null }))

  return {
    id: m.id,
    name: m.name || m.guest?.name || "Member",
    phone: m.phone,
    email: m.guest?.email ?? null,
    guestId: m.guestId,
    membershipNumber: m.membershipNumber,
    referralCode: m.referralCode,
    tier,
    tierOverride: isTier(m.tierOverride) ? m.tierOverride : null,
    tierOverrideUntil: m.tierOverrideUntil?.toISOString() ?? null,
    qualifyingSpend: spend,
    progress: nextTierProgress(spend, tier),
    birthday: toDateOnlyString(m.birthday),
    anniversary: toDateOnlyString(m.anniversary),
    joinedAt: m.joinedAt.toISOString(),
    summary,
    batches,
    reservations: reservations.map((r) => ({
      id: r.id, property: r.property.name, unit: r.unit.name, checkIn: r.checkIn.toISOString(), checkOut: r.checkOut.toISOString(), status: r.status,
      source: r.sourceDetail || r.source, channel: classifyChannel(r.source, r.sourceDetail), totalAmount: r.totalAmount, taxAmount: r.taxAmount,
      refundedAmount: r.refundedAmount, eligibleAmount: r.status === "CANCELLED" ? 0 : eligibleAmount(r), points: pointsByReservation.get(r.id) ?? 0,
    })),
    ledger: entries.map((e) => ({
      id: e.id, createdAt: e.createdAt.toISOString(), type: e.type, amount: e.amount, description: e.description, expiresAt: e.expiresAt?.toISOString() ?? null,
      reservationId: e.reservationId, property: e.property?.name ?? null, channel: e.channel, tier: e.tier, channelMultiplier: e.channelMultiplier,
      tierMultiplier: e.tierMultiplier, eligibleAmount: e.eligibleAmount, actor: e.actor, reason: e.reason,
    })),
    redemptions: redemptions.map((r) => ({ id: r.id, reference: r.reference, points: r.points, status: r.status, adminId: r.adminId, createdAt: r.createdAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null, failureReason: r.failureReason, transactionId: r.transactionId })),
    referralsMade: referralsMade.map((r) => ({ id: r.id, name: r.referee.name || "Member", membershipNumber: r.referee.membershipNumber, status: r.status, createdAt: r.createdAt.toISOString(), rewardedAt: r.rewardedAt?.toISOString() ?? null })),
    referredBy: referredVia ? { name: referredVia.referrer.name || "Member", membershipNumber: referredVia.referrer.membershipNumber, status: referredVia.status } : null,
    tierHistory: tierHistory.map((h) => ({ id: h.id, fromTier: h.fromTier, toTier: h.toTier, reason: h.reason, actor: h.actor, note: h.note, qualifyingSpend: h.qualifyingSpend, createdAt: h.createdAt.toISOString() })),
    audit: auditLog.map((a) => ({ id: a.id, actor: a.actor, action: a.action, details: a.details as Record<string, unknown>, createdAt: a.createdAt.toISOString() })),
    notifications: notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
  }
}

export type MemberDetail = NonNullable<Awaited<ReturnType<typeof memberDetail>>>

// Member portal view: the member's own data only, without staff/audit details.
export async function memberPortalView(id: string, now = new Date()) {
  const d = await memberDetail(id, now)
  if (!d) return null
  return {
    id: d.id, name: d.name, phone: d.phone, membershipNumber: d.membershipNumber, referralCode: d.referralCode, tier: d.tier,
    qualifyingSpend: d.qualifyingSpend, progress: d.progress, birthday: d.birthday, anniversary: d.anniversary, joinedAt: d.joinedAt,
    summary: d.summary, batches: d.batches, reservations: d.reservations, referralsMade: d.referralsMade, referredBy: d.referredBy,
    ledger: d.ledger.map((e) => ({ id: e.id, createdAt: e.createdAt, type: e.type, amount: e.amount, description: e.description, expiresAt: e.expiresAt, property: e.property })),
    redemptions: d.redemptions.filter((r) => r.status === "COMPLETED").map((r) => ({ id: r.id, reference: r.reference, points: r.points, completedAt: r.completedAt })),
  }
}

export type MemberPortalView = NonNullable<Awaited<ReturnType<typeof memberPortalView>>>
