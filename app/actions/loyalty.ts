"use server"

// Membership & Loyalty admin actions. Every action checks the admin session first and writes an audit row.

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/guard"
import { prisma } from "@/lib/prisma"
import { reconcileReservation } from "@/lib/loyalty/earning"
import { LoyaltyError, postCredit, postDebit, refreshBalanceCache, withMemberLock } from "@/lib/loyalty/ledger"
import { applyReferral, audit, ensureMembership, recalcTier } from "@/lib/loyalty/members"
import { flushOutbox, type OutboxItem } from "@/lib/loyalty/notify"
import { cancelRedemption, confirmRedemption, resendRedemptionOtp, startRedemption } from "@/lib/loyalty/redemption"
import { addMonths, isTier, parseDateOnly, TIER_INFO, tierRank, toDateOnlyString } from "@/lib/loyalty/rules"
import { randomUUID } from "node:crypto"

type Result<T = Record<string, unknown>> = ({ success: true } & T) | { success: false; error: string }

function fail(e: unknown): { success: false; error: string } {
  if (e instanceof LoyaltyError) return { success: false, error: e.message }
  console.error("[Loyalty action]", e)
  return { success: false, error: "Something went wrong. Please try again." }
}

function refresh(membershipId?: string) {
  revalidatePath("/loyalty")
  if (membershipId) revalidatePath("/loyalty/" + membershipId)
}

const cleanReason = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 300)

export async function adjustMemberPoints(membershipId: string, points: number, reason: string): Promise<Result<{ balance: number }>> {
  const session = await requireAdmin()
  try {
    const pts = Number(points)
    const why = cleanReason(reason)
    if (!Number.isInteger(pts) || pts === 0 || Math.abs(pts) > 100000) throw new LoyaltyError("Enter a whole number of points (use a minus sign to deduct).")
    if (why.length < 3) throw new LoyaltyError("A reason is required for every manual adjustment.")
    const now = new Date()
    const balance = await withMemberLock(membershipId, async (tx) => {
      const key = "ADJUST:" + randomUUID()
      const meta = { actor: session.u, reason: why }
      if (pts > 0) await postCredit(tx, { membershipId, points: pts, type: "ADJUSTMENT", description: `Manual credit: ${why}`, idempotencyKey: key, meta }, now)
      else await postDebit(tx, { membershipId, points: -pts, type: "ADJUSTMENT", description: `Manual debit: ${why}`, idempotencyKey: key, meta }, now)
      await audit(tx, session.u, "POINTS_ADJUSTED", membershipId, { points: pts, reason: why })
      return (await refreshBalanceCache(tx, membershipId, now)).available
    })
    refresh(membershipId)
    return { success: true, balance }
  } catch (e) {
    return fail(e)
  }
}

// Manual upgrade/downgrade. The override holds until `until` (default 6 months), then the rolling rule takes over.
// Passing tier = "" removes the override.
export async function setMemberTier(membershipId: string, tier: string, until: string, reason: string): Promise<Result> {
  const session = await requireAdmin()
  try {
    const why = cleanReason(reason)
    if (why.length < 3) throw new LoyaltyError("A reason is required to change a member's tier.")
    if (tier && !isTier(tier)) throw new LoyaltyError("Choose a valid tier.")
    const now = new Date()
    let untilDate: Date | null = null
    if (tier) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(until ?? ""))
      untilDate = m ? new Date(`${until}T23:59:59+05:30`) : addMonths(now, 6)
      if (isNaN(untilDate.getTime()) || untilDate.getTime() <= now.getTime()) throw new LoyaltyError("The override end date must be in the future.")
    }
    const outbox: OutboxItem[] = []
    await withMemberLock(membershipId, async (tx) => {
      const before = await tx.membership.findUniqueOrThrow({ where: { id: membershipId } })
      await tx.membership.update({ where: { id: membershipId }, data: { tierOverride: tier || null, tierOverrideUntil: untilDate } })
      if (tier && tier !== before.tier) {
        await tx.memberTierHistory.create({ data: { membershipId, fromTier: before.tier, toTier: tier, reason: "MANUAL", qualifyingSpend: before.qualifyingSpend, actor: session.u, note: why, createdAt: now } })
        await tx.membership.update({ where: { id: membershipId }, data: { tier } })
        if (isTier(before.tier) && tierRank(tier as never) > tierRank(before.tier) && before.phone) {
          outbox.push({ kind: "TIER_UPGRADE", membershipId, to: before.phone, dedupeKey: `TIER_UPGRADE:${membershipId}:${tier}:${now.toISOString().slice(0, 10)}`, vars: { name: (before.name ?? "Guest").split(" ")[0], tier: TIER_INFO[tier as "STAR"].label, multiplier: String(TIER_INFO[tier as "STAR"].multiplier) } })
        }
      } else if (!tier) {
        await recalcTier(tx, membershipId, now, outbox, session.u)
      }
      await audit(tx, session.u, "TIER_CHANGED", membershipId, { from: before.tier, override: tier || null, until: untilDate?.toISOString() ?? null, reason: why })
    })
    await flushOutbox(outbox)
    refresh(membershipId)
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateMemberDates(membershipId: string, birthday: string, anniversary: string): Promise<Result> {
  const session = await requireAdmin()
  try {
    const b = birthday ? parseDateOnly(birthday) : null
    const a = anniversary ? parseDateOnly(anniversary) : null
    if (birthday && !b) throw new LoyaltyError("Enter a valid birthday (not in the future).")
    if (anniversary && !a) throw new LoyaltyError("Enter a valid anniversary (not in the future).")
    const before = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } })
    await prisma.membership.update({ where: { id: membershipId }, data: { birthday: b, anniversary: a } })
    await audit(prisma, session.u, "DATES_EDITED", membershipId, {
      birthday: { from: toDateOnlyString(before.birthday), to: toDateOnlyString(b) },
      anniversary: { from: toDateOnlyString(before.anniversary), to: toDateOnlyString(a) },
    })
    refresh(membershipId)
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

export async function startPointsRedemption(membershipId: string, points: number, reservationId: string, note: string): Promise<Result<{ redemptionId: string; reference: string; sentTo: string; expiresInSeconds: number }>> {
  const session = await requireAdmin()
  try {
    const r = await startRedemption({ membershipId, points: Number(points), adminId: session.u, reservationId: reservationId || null, note: cleanReason(note) || null })
    return { success: true, ...r }
  } catch (e) {
    return fail(e)
  }
}

export async function resendPointsRedemptionOtp(redemptionId: string): Promise<Result<{ sentTo: string; expiresInSeconds: number }>> {
  const session = await requireAdmin()
  try {
    return { success: true, ...(await resendRedemptionOtp(redemptionId, session.u)) }
  } catch (e) {
    return fail(e)
  }
}

export async function confirmPointsRedemption(redemptionId: string, code: string): Promise<Result<{ reference: string; points: number; value: number; transactionId: string; balance: number }>> {
  const session = await requireAdmin()
  try {
    const r = await confirmRedemption({ redemptionId, code: String(code ?? ""), adminId: session.u })
    const red = await prisma.redemption.findUnique({ where: { id: redemptionId }, select: { membershipId: true } })
    refresh(red?.membershipId)
    return { success: true, ...r }
  } catch (e) {
    return fail(e)
  }
}

export async function cancelPointsRedemption(redemptionId: string): Promise<Result> {
  const session = await requireAdmin()
  try {
    await cancelRedemption(redemptionId, session.u)
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

// Records the total refunded on a stay; its points are re-calculated (partial reversal) straight away.
export async function recordStayRefund(reservationId: string, refundedAmount: number, reason: string): Promise<Result<{ action: string; points: number }>> {
  const session = await requireAdmin()
  try {
    const amount = Math.round(Number(refundedAmount) * 100) / 100
    const why = cleanReason(reason)
    if (!Number.isFinite(amount) || amount < 0) throw new LoyaltyError("Enter the total refunded amount in rupees.")
    if (why.length < 3) throw new LoyaltyError("A reason is required.")
    const r = await prisma.reservation.findUnique({ where: { id: reservationId } })
    if (!r) throw new LoyaltyError("Booking not found.")
    if (amount > r.totalAmount) throw new LoyaltyError("The refund can't be more than the booking total.")
    await prisma.reservation.update({ where: { id: reservationId }, data: { refundedAmount: amount } })
    const res = await reconcileReservation(reservationId)
    await audit(prisma, session.u, "REFUND_RECORDED", res.membershipId, { reservationId, from: r.refundedAmount, to: amount, reason: why, pointsChange: res.points })
    refresh(res.membershipId ?? undefined)
    return { success: true, action: res.action, points: res.points }
  } catch (e) {
    return fail(e)
  }
}

export async function applyMemberReferral(membershipId: string, code: string): Promise<Result> {
  const session = await requireAdmin()
  try {
    await applyReferral(membershipId, code, session.u)
    refresh(membershipId)
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

export async function enrollGuestInLoyalty(guestId: string): Promise<Result<{ membershipId: string }>> {
  const session = await requireAdmin()
  try {
    const g = await prisma.guest.findUnique({ where: { id: guestId } })
    if (!g) throw new LoyaltyError("Guest not found.")
    const m = await ensureMembership({ phone: g.phone, name: g.name, guestId: g.id })
    if (!m) throw new LoyaltyError("This guest needs a valid mobile number to become a member.")
    await audit(prisma, session.u, "MEMBER_ENROLLED", m.id, { guestId })
    refresh(m.id)
    return { success: true, membershipId: m.id }
  } catch (e) {
    return fail(e)
  }
}
