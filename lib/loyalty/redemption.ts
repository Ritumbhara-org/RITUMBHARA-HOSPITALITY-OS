// Points redemption, initiated by staff and approved by the member with a WhatsApp OTP. SERVER-ONLY.
// There is no other way to redeem: confirmRedemption() needs the code sent to the member's registered number.

import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { getPointsSummary, LoyaltyError, postDebit, refreshBalanceCache, withMemberLock } from "./ledger"
import { audit, firstName } from "./members"
import { flushOutbox, sendOtpMessage } from "./notify"
import { issueOtp, OTP_TTL_MS, verifyOtp } from "./otp"
import { maskMemberPhone, POINT_VALUE_INR } from "./rules"

export const MAX_REDEMPTION_POINTS = 1_000_000

function newReference(): string {
  return "RDM-" + randomBytes(5).toString("hex").toUpperCase()
}

export async function startRedemption(input: { membershipId: string; points: number; adminId: string; reservationId?: string | null; note?: string | null }, now = new Date()) {
  const points = Number(input.points)
  if (!Number.isInteger(points) || points <= 0 || points > MAX_REDEMPTION_POINTS) throw new LoyaltyError("Enter a whole number of points greater than zero.")
  const m = await prisma.membership.findUnique({ where: { id: input.membershipId } })
  if (!m) throw new LoyaltyError("Member not found.")
  if (!m.phone) throw new LoyaltyError("This member has no registered mobile number, so the OTP can't be sent.")
  const summary = await getPointsSummary(m.id, now)
  if (summary.available < points) throw new LoyaltyError(`Not enough points: ${Math.max(0, summary.available)} available.`, "INSUFFICIENT_POINTS")

  let reservation: { id: string; propertyId: string } | null = null
  if (input.reservationId) {
    reservation = await prisma.reservation.findUnique({ where: { id: input.reservationId }, select: { id: true, propertyId: true } })
    if (!reservation) throw new LoyaltyError("Booking not found.")
  }

  // One open request per member: starting a new one cancels any earlier request still waiting for its code.
  await prisma.redemption.updateMany({ where: { membershipId: m.id, status: "PENDING_OTP" }, data: { status: "CANCELLED", failureReason: "Replaced by a new request" } })
  const redemption = await prisma.redemption.create({
    data: {
      reference: newReference(), membershipId: m.id, points, adminId: input.adminId, reservationId: reservation?.id ?? null,
      propertyId: reservation?.propertyId ?? null, note: input.note?.slice(0, 300) || null, createdAt: now,
    },
  })
  const sent = await sendRedemptionCode(redemption.id, m.phone, now)
  if (!sent.ok) {
    await prisma.redemption.update({ where: { id: redemption.id }, data: { status: "FAILED", failureReason: sent.error } })
    throw new LoyaltyError(sent.error)
  }
  await audit(prisma, input.adminId, "REDEMPTION_STARTED", m.id, { redemptionId: redemption.id, reference: redemption.reference, points })
  return { redemptionId: redemption.id, reference: redemption.reference, sentTo: maskMemberPhone(m.phone), expiresInSeconds: OTP_TTL_MS / 1000 }
}

async function sendRedemptionCode(redemptionId: string, phone: string, now: Date): Promise<{ ok: true } | { ok: false; error: string }> {
  const otp = await issueOtp({ purpose: "REDEMPTION", phone, redemptionId }, now.getTime())
  if (!otp.ok) return { ok: false, error: otp.error }
  const r = await sendOtpMessage(phone, otp.code, redemptionId)
  if (!r.ok) return { ok: false, error: "We couldn't send the code on WhatsApp. Please try again." }
  return { ok: true }
}

export async function resendRedemptionOtp(redemptionId: string, adminId: string, now = new Date()) {
  const red = await prisma.redemption.findUnique({ where: { id: redemptionId }, include: { membership: true } })
  if (!red || red.status !== "PENDING_OTP") throw new LoyaltyError("This redemption request is no longer open. Please start again.")
  if (!red.membership.phone) throw new LoyaltyError("This member has no registered mobile number.")
  const sent = await sendRedemptionCode(red.id, red.membership.phone, now)
  if (!sent.ok) throw new LoyaltyError(sent.error)
  await audit(prisma, adminId, "REDEMPTION_OTP_RESENT", red.membershipId, { redemptionId })
  return { sentTo: maskMemberPhone(red.membership.phone), expiresInSeconds: OTP_TTL_MS / 1000 }
}

export async function confirmRedemption(input: { redemptionId: string; code: string; adminId: string }, now = new Date()) {
  const red = await prisma.redemption.findUnique({ where: { id: input.redemptionId }, include: { membership: true } })
  if (!red || red.status !== "PENDING_OTP") throw new LoyaltyError("This redemption request is no longer open. Please start again.")
  if (!red.membership.phone) throw new LoyaltyError("This member has no registered mobile number.")

  const v = await verifyOtp({ purpose: "REDEMPTION", phone: red.membership.phone, code: input.code, redemptionId: red.id }, now.getTime())
  if (!v.ok) {
    await audit(prisma, input.adminId, "REDEMPTION_OTP_FAILED", red.membershipId, { redemptionId: red.id, locked: !!v.locked })
    if (v.locked) await prisma.redemption.updateMany({ where: { id: red.id, status: "PENDING_OTP" }, data: { status: "FAILED", failureReason: "Too many wrong codes" } })
    throw new LoyaltyError(v.error, v.locked ? "OTP_LOCKED" : "OTP_INVALID")
  }

  const outcome = await withMemberLock(red.membershipId, async (tx) => {
    // Re-check inside the lock: only one confirmation can move the request out of PENDING_OTP.
    const claimed = await tx.redemption.updateMany({ where: { id: red.id, status: "PENDING_OTP" }, data: { status: "COMPLETED", completedAt: now } })
    if (claimed.count === 0) throw new LoyaltyError("This redemption has already been processed.")
    const debit = await postDebit(tx, {
      membershipId: red.membershipId, points: red.points, type: "REDEMPTION",
      description: `Redeemed ${red.points} points (₹${red.points * POINT_VALUE_INR}) — ref ${red.reference}`,
      idempotencyKey: `REDEMPTION:${red.id}`,
      meta: { relatedId: red.id, reservationId: red.reservationId, propertyId: red.propertyId, actor: input.adminId, reason: red.note },
    }, now)
    await tx.redemption.update({ where: { id: red.id }, data: { transactionId: debit.entry.id } })
    const summary = await refreshBalanceCache(tx, red.membershipId, now)
    return { transactionId: debit.entry.id, balance: summary.available }
  }).catch(async (e) => {
    if (e instanceof LoyaltyError && e.code === "INSUFFICIENT_POINTS") {
      await prisma.redemption.updateMany({ where: { id: red.id, status: "PENDING_OTP" }, data: { status: "FAILED", failureReason: e.message } })
    }
    throw e
  })

  await audit(prisma, input.adminId, "REDEMPTION_COMPLETED", red.membershipId, { redemptionId: red.id, reference: red.reference, points: red.points, transactionId: outcome.transactionId })
  await flushOutbox([{
    kind: "REDEMPTION_SUCCESS", membershipId: red.membershipId, to: red.membership.phone, dedupeKey: `REDEMPTION_SUCCESS:${red.id}`,
    vars: { name: firstName(red.membership.name), points: String(red.points), reference: red.reference, balance: String(Math.max(0, outcome.balance)) },
  }])

  // Front desk alert for a redemption against a booking (existing POINTS_REDEEMED listener).
  if (red.reservationId && red.membership.guestId && red.propertyId) {
    const { eventBus } = await import("@/lib/events/bus")
    await eventBus.emit("POINTS_REDEEMED", { guestId: red.membership.guestId, propertyId: red.propertyId, reservationId: red.reservationId, pointsRedeemed: red.points, rupeeDiscount: red.points * POINT_VALUE_INR }).catch(() => {})
  }
  return { reference: red.reference, points: red.points, value: red.points * POINT_VALUE_INR, transactionId: outcome.transactionId, balance: outcome.balance }
}

export async function cancelRedemption(redemptionId: string, adminId: string) {
  const red = await prisma.redemption.findUnique({ where: { id: redemptionId } })
  if (!red) throw new LoyaltyError("Redemption not found.")
  const r = await prisma.redemption.updateMany({ where: { id: redemptionId, status: "PENDING_OTP" }, data: { status: "CANCELLED", failureReason: "Cancelled by staff" } })
  if (r.count) await audit(prisma, adminId, "REDEMPTION_CANCELLED", red.membershipId, { redemptionId })
  return { cancelled: r.count > 0 }
}
