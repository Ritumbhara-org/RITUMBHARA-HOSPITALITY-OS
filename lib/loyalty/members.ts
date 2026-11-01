// Members: enrolment (one membership per mobile number), tier qualification and referrals. SERVER-ONLY.

import { randomInt } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/utils/phone"
import { LoyaltyError, type Tx } from "./ledger"
import type { OutboxItem } from "./notify"
import {
  effectiveTier, eligibleAmount, isTier, isValidMemberPhone, qualificationWindowStart, tierForSpend, tierRank, TIER_INFO, type Tier,
} from "./rules"

type Db = Tx | typeof prisma

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function newReferralCode(): string {
  let s = "RB"
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]
  return s
}

export function normalizeReferralCode(code: unknown): string {
  return String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40)
}

async function nextMembershipNumber(db: Db): Promise<string> {
  const rows = await db.$queryRaw<{ n: string }[]>`SELECT nextval('"MembershipNumberSeq"')::text AS n`
  return "RBM-" + rows[0].n
}

export async function audit(db: Db, actor: string, action: string, membershipId: string | null, details: Record<string, unknown> = {}) {
  await db.loyaltyAuditLog.create({ data: { actor, action, membershipId, details: details as Prisma.InputJsonValue } })
}

function isUniqueViolation(e: unknown) {
  return (e as { code?: string })?.code === "P2002"
}

// Finds the membership for a mobile number, or creates a Star membership for it. Guests booked through different
// channels share one membership as long as the mobile number matches. Returns null for missing/placeholder numbers.
export async function ensureMembership(input: { phone: string | null | undefined; name?: string | null; guestId?: string | null }, now = new Date()) {
  const phone = normalizePhoneNumber(input.phone)
  if (!isValidMemberPhone(phone)) return null
  const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null

  let m = await prisma.membership.findUnique({ where: { phone } })
  if (m) {
    const data: Prisma.MembershipUpdateInput = {}
    if (!m.guestId && input.guestId) {
      const taken = await prisma.membership.findUnique({ where: { guestId: input.guestId } })
      if (!taken) data.guest = { connect: { id: input.guestId } }
    }
    if (!m.name && name) data.name = name
    if (Object.keys(data).length) m = await prisma.membership.update({ where: { id: m.id }, data })
    return m
  }

  // A membership from the previous programme linked to this guest but without a phone: adopt it.
  if (input.guestId) {
    const legacy = await prisma.membership.findUnique({ where: { guestId: input.guestId } })
    if (legacy && !legacy.phone) {
      try {
        return await prisma.membership.update({ where: { id: legacy.id }, data: { phone, name: legacy.name ?? name } })
      } catch (e) {
        if (!isUniqueViolation(e)) throw e
        return prisma.membership.findUnique({ where: { phone } })
      }
    }
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const guestFree = input.guestId ? !(await prisma.membership.findUnique({ where: { guestId: input.guestId } })) : false
      return await prisma.$transaction(async (tx) => {
        const created = await tx.membership.create({
          data: {
            phone, name, tier: "STAR", points: 0, joinedAt: now,
            membershipNumber: await nextMembershipNumber(tx),
            referralCode: newReferralCode(),
            ...(guestFree && input.guestId ? { guestId: input.guestId } : {}),
          },
        })
        await tx.memberTierHistory.create({ data: { membershipId: created.id, fromTier: null, toTier: "STAR", reason: "ENROLLED", createdAt: now } })
        return created
      })
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      const raced = await prisma.membership.findUnique({ where: { phone } })
      if (raced) return raced
      // otherwise the referral code collided: try again with a new one
    }
  }
  throw new LoyaltyError("Could not create the membership. Please try again.")
}

// Reservations belonging to a member: any guest record with the member's mobile number, plus the linked guest.
export function memberReservationWhere(m: { phone: string | null; guestId: string | null }): Prisma.ReservationWhereInput {
  const or: Prisma.ReservationWhereInput[] = []
  if (m.phone) or.push({ guest: { phone: m.phone } })
  if (m.guestId) or.push({ guestId: m.guestId })
  return or.length ? { OR: or } : { id: "__none__" }
}

// Rolling 6-month qualifying spend: eligible value of completed (checked-out), non-cancelled stays whose check-out
// falls in (now − 6 months, now].
export async function qualifyingSpend(db: Db, m: { phone: string | null; guestId: string | null }, now: Date, excludeReservationId?: string): Promise<number> {
  const rows = await db.reservation.findMany({
    where: {
      AND: [memberReservationWhere(m), { status: "CHECKED_OUT", checkOut: { gt: qualificationWindowStart(now), lte: now } }],
      ...(excludeReservationId ? { NOT: { id: excludeReservationId } } : {}),
    },
    select: { totalAmount: true, taxAmount: true, refundedAmount: true },
  })
  return Math.round(rows.reduce((s, r) => s + eligibleAmount(r), 0) * 100) / 100
}

// Re-evaluates the member's tier from the rolling window (or a still-active manual override), records any change in
// the tier history and queues the upgrade message. Must run inside withMemberLock.
export async function recalcTier(tx: Tx, membershipId: string, now: Date, outbox: OutboxItem[], actor = "SYSTEM"): Promise<{ from: Tier; to: Tier; spend: number }> {
  const m = await tx.membership.findUniqueOrThrow({ where: { id: membershipId } })
  const spend = await qualifyingSpend(tx, m, now)
  const computed = tierForSpend(spend)
  const overrideEnded = !!m.tierOverride && !!m.tierOverrideUntil && m.tierOverrideUntil.getTime() <= now.getTime()
  const to = effectiveTier(computed, overrideEnded ? null : m.tierOverride, m.tierOverrideUntil, now)
  const from: Tier = isTier(m.tier) ? m.tier : "STAR"
  await tx.membership.update({
    where: { id: m.id },
    data: { tier: to, qualifyingSpend: spend, tierEvaluatedAt: now, ...(overrideEnded ? { tierOverride: null, tierOverrideUntil: null } : {}) },
  })
  if (to !== from) {
    const up = tierRank(to) > tierRank(from)
    await tx.memberTierHistory.create({
      data: { membershipId: m.id, fromTier: from, toTier: to, reason: overrideEnded ? "OVERRIDE_ENDED" : up ? "AUTO_UPGRADE" : "AUTO_DOWNGRADE", qualifyingSpend: spend, actor, createdAt: now },
    })
    if (up && m.phone) {
      outbox.push({
        kind: "TIER_UPGRADE", membershipId: m.id, to: m.phone, dedupeKey: `TIER_UPGRADE:${m.id}:${to}:${now.toISOString().slice(0, 10)}`,
        vars: { name: firstName(m.name), tier: TIER_INFO[to].label, multiplier: String(TIER_INFO[to].multiplier) },
      })
    }
  }
  return { from, to, spend }
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "Guest"
}

// Links a new member to the member who referred them. Rewards are paid later, after the referred member's first
// completed and paid stay (lib/loyalty/earning.ts).
export async function applyReferral(refereeId: string, rawCode: string, actor: string, now = new Date()) {
  const code = normalizeReferralCode(rawCode)
  if (!code) throw new LoyaltyError("Please enter a referral code.")
  const [referee, referrer] = await Promise.all([
    prisma.membership.findUnique({ where: { id: refereeId }, include: { referredVia: true } }),
    prisma.membership.findFirst({ where: { referralCode: { equals: code, mode: "insensitive" } } }),
  ])
  if (!referee) throw new LoyaltyError("Member not found.")
  if (!referrer) throw new LoyaltyError("That referral code isn't valid.")
  if (referrer.id === referee.id || (referrer.phone && referrer.phone === referee.phone)) throw new LoyaltyError("You can't use your own referral code.")
  if (referee.referredVia) throw new LoyaltyError("A referral code has already been applied to this membership.")
  if (referee.guestId && referrer.guestId && referee.guestId === referrer.guestId) throw new LoyaltyError("You can't use your own referral code.")
  const completedStays = await prisma.reservation.count({ where: { AND: [memberReservationWhere(referee), { status: "CHECKED_OUT" }] } })
  if (completedStays > 0) throw new LoyaltyError("Referral codes are for new guests, before their first stay.")
  try {
    const referral = await prisma.$transaction(async (tx) => {
      const r = await tx.referral.create({ data: { referrerId: referrer.id, refereeId: referee.id, code: referrer.referralCode, createdAt: now } })
      await tx.membership.update({ where: { id: referee.id }, data: { referredBy: referrer.referralCode } })
      await audit(tx, actor, "REFERRAL_APPLIED", referee.id, { referrerId: referrer.id, code: referrer.referralCode })
      return r
    })
    return referral
  } catch (e) {
    if (isUniqueViolation(e)) throw new LoyaltyError("A referral code has already been applied to this membership.")
    throw e
  }
}
