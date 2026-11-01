// Booking points: earn on completed stays, adjust on modifications / partial refunds, reverse on cancellations,
// and pay referral rewards after the referred member's first completed and paid stay. SERVER-ONLY.
//
// reconcileReservation() is idempotent: it compares what the ledger already holds for a reservation with what the
// reservation is worth now and posts only the difference, so duplicate webhooks, repeated syncs and the safety-net
// job can call it any number of times.

import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/utils/phone"
import { postCredit, postDebit, refreshBalanceCache, withMemberLock } from "./ledger"
import { ensureMembership, firstName, qualifyingSpend, recalcTier } from "./members"
import { flushOutbox, type OutboxItem } from "./notify"
import {
  calculatePoints, classifyChannel, CHANNEL_MULTIPLIER, effectiveTier, eligibleAmount, isReservationPaid, isTier, REFERRAL_BONUS_POINTS,
  TIER_INFO, tierForSpend, type Channel, type Tier,
} from "./rules"

const BOOKING_TYPES = ["EARN_BOOKING", "BOOKING_ADJUSTMENT", "BOOKING_REVERSAL"]

// Stays checked out before this date (IST) were part of the old programme and don't earn now. They still count
// toward tier qualification. LOYALTY_PROGRAM_START=YYYY-MM-DD overrides.
export function programStart(env = process.env): Date {
  const v = String(env.LOYALTY_PROGRAM_START || "").trim()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00+05:30") : new Date("2026-11-01T00:00:00+05:30")
  return isNaN(d.getTime()) ? new Date("2026-11-01T00:00:00+05:30") : d
}

export interface ReconcileResult {
  reservationId: string
  membershipId: string | null
  action: "none" | "earned" | "adjusted" | "reversed" | "skipped"
  points: number
  reason?: string
}

export async function reconcileReservation(reservationId: string, now = new Date(), opts: { send?: boolean } = {}): Promise<ReconcileResult> {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { guest: true, property: { select: { name: true } } } })
  if (!r) return { reservationId, membershipId: null, action: "skipped", points: 0, reason: "not_found" }
  const phone = normalizePhoneNumber(r.guest.phone)

  const cancelled = r.status === "CANCELLED"
  let membership = await prisma.membership.findUnique({ where: { phone } }).catch(() => null)
  if (!membership && !cancelled) membership = await ensureMembership({ phone, name: r.guest.name, guestId: r.guestId }, now)
  if (!membership) {
    // A cancelled booking may still have earned under a membership found through the linked guest.
    membership = await prisma.membership.findUnique({ where: { guestId: r.guestId } })
    if (!membership) return { reservationId, membershipId: null, action: "skipped", points: 0, reason: "no_member" }
  }

  const outbox: OutboxItem[] = []
  const memberId = membership.id
  const result = await withMemberLock(memberId, async (tx) => {
    const m = await tx.membership.findUniqueOrThrow({ where: { id: memberId } })
    const entries = await tx.pointTransaction.findMany({ where: { reservationId: r.id, type: { in: BOOKING_TYPES } }, orderBy: { createdAt: "asc" } })
    const earn = entries.find((e) => e.type === "EARN_BOOKING")
    const net = entries.reduce((s, e) => s + e.amount, 0)
    const amount = eligibleAmount(r)
    const base = { reservationId: r.id, propertyId: r.propertyId, eligibleAmount: amount, actor: "SYSTEM" }
    let action: ReconcileResult["action"] = "none"
    let delta = 0

    if (r.status === "CHECKED_OUT" && r.checkOut.getTime() >= programStart().getTime()) {
      if (!earn) {
        // Tier applicable when the booking completed: qualification from the member's OTHER completed stays.
        const priorSpend = await qualifyingSpend(tx, m, now, r.id)
        const tier: Tier = effectiveTier(tierForSpend(priorSpend), m.tierOverride, m.tierOverrideUntil, now)
        const channel: Channel = classifyChannel(r.source, r.sourceDetail)
        const points = calculatePoints(amount, channel, tier)
        if (points > 0) {
          const calc = { formula: "FLOOR(amount / 100 × 5 × channel × tier)", eligibleAmount: amount, totalAmount: r.totalAmount, taxAmount: r.taxAmount, refundedAmount: r.refundedAmount, channel, channelMultiplier: CHANNEL_MULTIPLIER[channel], tier, tierMultiplier: TIER_INFO[tier].multiplier, priorQualifyingSpend: priorSpend, points }
          const res = await postCredit(tx, {
            membershipId: m.id, points, type: "EARN_BOOKING",
            description: `Stay at ${r.property?.name ?? "Ritumbhara"} (${channel === "DIRECT" ? "direct" : "OTA"} booking, ${TIER_INFO[tier].label})`,
            idempotencyKey: `EARN:${r.id}`,
            meta: { ...base, channel, tier, channelMultiplier: CHANNEL_MULTIPLIER[channel], tierMultiplier: TIER_INFO[tier].multiplier, calculation: calc },
          }, now)
          if (res.created) {
            action = "earned"
            delta = points
          }
        }
      } else {
        const tier: Tier = isTier(earn.tier) ? earn.tier : "STAR"
        const channel: Channel = earn.channel === "DIRECT" ? "DIRECT" : "OTA"
        const target = calculatePoints(amount, channel, tier)
        delta = target - net
        const key = `BOOKING_ADJ:${r.id}:${entries.length}`
        const meta = { ...base, channel, tier, channelMultiplier: CHANNEL_MULTIPLIER[channel], tierMultiplier: TIER_INFO[tier].multiplier, relatedId: earn.id, calculation: { eligibleAmount: amount, target, previouslyAwarded: net } }
        if (delta > 0) {
          await postCredit(tx, { membershipId: m.id, points: delta, type: "BOOKING_ADJUSTMENT", description: "Stay amount increased", idempotencyKey: key, meta }, now)
          action = "adjusted"
        } else if (delta < 0) {
          await postDebit(tx, { membershipId: m.id, points: -delta, type: "BOOKING_REVERSAL", description: r.refundedAmount > 0 ? "Partial refund on stay" : "Stay amount reduced", idempotencyKey: key, meta, allowShortfall: true, preferCreditId: earn.id }, now)
          action = "reversed"
        }
      }
    } else if (cancelled && net > 0) {
      delta = -net
      await postDebit(tx, {
        membershipId: m.id, points: net, type: "BOOKING_REVERSAL", description: "Booking cancelled — points reversed",
        idempotencyKey: `BOOKING_ADJ:${r.id}:${entries.length}`, meta: { ...base, eligibleAmount: 0, relatedId: earn?.id ?? null },
        allowShortfall: true, preferCreditId: earn?.id,
      }, now)
      action = "reversed"
    }

    const summary = await refreshBalanceCache(tx, m.id, now)
    await recalcTier(tx, m.id, now, outbox)
    if (action === "earned" && m.phone) {
      outbox.push({
        kind: "POINTS_CREDITED", membershipId: m.id, to: m.phone, dedupeKey: `POINTS_CREDITED:${r.id}`,
        vars: { name: firstName(m.name), points: String(delta), balance: String(Math.max(0, summary.available)), value: String(Math.max(0, summary.available)) },
      })
    }
    return { action, points: delta }
  })

  if (r.status === "CHECKED_OUT" && isReservationPaid(r)) await rewardReferralIfDue(memberId, r.id, now, outbox)
  if (opts.send !== false) await flushOutbox(outbox)
  return { reservationId, membershipId: memberId, ...result }
}

// Both members get 100 points once the referred member has a completed and paid stay. Each credit has its own
// idempotency key, so a crash half-way is completed by the next run without paying anyone twice.
export async function rewardReferralIfDue(refereeId: string, reservationId: string, now: Date, outbox: OutboxItem[]) {
  const referral = await prisma.referral.findUnique({ where: { refereeId }, include: { referee: true, referrer: true } })
  if (!referral || referral.status === "REJECTED") return
  const qualifyingId = referral.qualifyingReservationId ?? reservationId
  if (referral.status === "PENDING") {
    // Claim the first qualifying stay (unique), so two stays can't both trigger the reward.
    const claimed = await prisma.referral.updateMany({ where: { id: referral.id, status: "PENDING", qualifyingReservationId: null }, data: { qualifyingReservationId: reservationId } })
    if (claimed.count === 0 && referral.qualifyingReservationId !== reservationId) return
  } else if (referral.qualifyingReservationId !== reservationId) {
    return
  }
  for (const side of ["referee", "referrer"] as const) {
    const member = side === "referee" ? referral.referee : referral.referrer
    await withMemberLock(member.id, async (tx) => {
      const res = await postCredit(tx, {
        membershipId: member.id, points: REFERRAL_BONUS_POINTS, type: "BONUS_REFERRAL",
        description: side === "referee" ? "Welcome bonus for joining through a referral" : `Referral bonus — ${firstName(referral.referee.name)} completed their first stay`,
        idempotencyKey: `REFERRAL:${referral.id}:${side}`, meta: { relatedId: referral.id, reservationId: qualifyingId, actor: "SYSTEM" },
      }, now)
      const summary = await refreshBalanceCache(tx, member.id, now)
      if (res.created && member.phone) {
        outbox.push({
          kind: "REFERRAL_BONUS", membershipId: member.id, to: member.phone, dedupeKey: `REFERRAL_BONUS:${referral.id}:${side}`,
          vars: { name: firstName(member.name), points: String(REFERRAL_BONUS_POINTS), balance: String(Math.max(0, summary.available)) },
        })
      }
    })
  }
  await prisma.referral.updateMany({ where: { id: referral.id, status: "PENDING" }, data: { status: "REWARDED", rewardedAt: now } })
}
