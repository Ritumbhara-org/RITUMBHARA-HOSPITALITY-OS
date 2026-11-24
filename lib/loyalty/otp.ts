// One-time codes for member sign-in and redemption approval. SERVER-ONLY.
// 6 digits, valid 5 minutes, 3 wrong tries lock the code, rate-limited per number (and per IP for sign-in) using
// the database, so limits hold across serverless instances. Only a keyed hash of the code is stored.

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"

export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 3
export const OTP_RESEND_GAP_MS = 60 * 1000
export const OTP_MAX_PER_15_MIN = 3
export const OTP_MAX_PER_DAY = 10
export const OTP_MAX_PER_IP_15_MIN = 10

export type OtpPurpose = "LOGIN" | "REDEMPTION"

function secret(): string {
  const s = process.env.LOYALTY_OTP_SECRET || process.env.ADMIN_SESSION_SECRET || ""
  if (s.length < 16) throw new Error("LOYALTY_OTP_SECRET (or ADMIN_SESSION_SECRET) is not configured.")
  return s
}

export function hashCode(otpId: string, code: string): string {
  return createHmac("sha256", secret()).update("loyalty-otp:" + otpId + ":" + code).digest("hex")
}

function codeMatches(otpId: string, code: string, stored: string): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const a = Buffer.from(hashCode(otpId, code), "hex")
  const b = Buffer.from(stored, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export type OtpResult = { ok: true; otpId: string; code: string } | { ok: false; status: number; error: string; retryAfter?: number }

export async function issueOtp(input: { purpose: OtpPurpose; phone: string; redemptionId?: string | null; ip?: string | null }, nowMs = Date.now()): Promise<OtpResult> {
  const since15 = new Date(nowMs - 15 * 60 * 1000)
  const sinceDay = new Date(nowMs - 24 * 60 * 60 * 1000)
  const where = { phone: input.phone, purpose: input.purpose }
  const [last, recent, daily, byIp] = await Promise.all([
    prisma.loyaltyOtp.findFirst({ where, orderBy: { createdAt: "desc" } }),
    prisma.loyaltyOtp.count({ where: { ...where, createdAt: { gte: since15 } } }),
    prisma.loyaltyOtp.count({ where: { ...where, createdAt: { gte: sinceDay } } }),
    input.ip && input.purpose === "LOGIN" ? prisma.loyaltyOtp.count({ where: { ip: input.ip, purpose: "LOGIN", createdAt: { gte: since15 } } }) : Promise.resolve(0),
  ])
  if (last && nowMs - last.createdAt.getTime() < OTP_RESEND_GAP_MS) {
    const wait = Math.ceil((OTP_RESEND_GAP_MS - (nowMs - last.createdAt.getTime())) / 1000)
    return { ok: false, status: 429, error: `Please wait ${wait} seconds before requesting another code.`, retryAfter: wait }
  }
  if (recent >= OTP_MAX_PER_15_MIN || daily >= OTP_MAX_PER_DAY || byIp >= OTP_MAX_PER_IP_15_MIN) {
    return { ok: false, status: 429, error: "Too many codes requested. Please try again later." }
  }
  const now = new Date(nowMs)
  // Only the newest code is usable.
  await prisma.loyaltyOtp.updateMany({ where: { ...where, consumedAt: null, ...(input.redemptionId ? { redemptionId: input.redemptionId } : {}) }, data: { consumedAt: now } })
  const id = randomUUID()
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await prisma.loyaltyOtp.create({
    data: { id, purpose: input.purpose, phone: input.phone, redemptionId: input.redemptionId ?? null, codeHash: hashCode(id, code), expiresAt: new Date(nowMs + OTP_TTL_MS), ip: input.ip ?? null, createdAt: now },
  })
  return { ok: true, otpId: id, code }
}

export type VerifyResult = { ok: true; otpId: string } | { ok: false; status: number; error: string; attemptsLeft?: number; locked?: boolean }

export async function verifyOtp(input: { purpose: OtpPurpose; phone: string; code: string; redemptionId?: string | null }, nowMs = Date.now()): Promise<VerifyResult> {
  const code = String(input.code ?? "").replace(/\D/g, "")
  const otp = await prisma.loyaltyOtp.findFirst({
    where: { phone: input.phone, purpose: input.purpose, consumedAt: null, ...(input.redemptionId ? { redemptionId: input.redemptionId } : {}) },
    orderBy: { createdAt: "desc" },
  })
  if (!otp) return { ok: false, status: 400, error: "Please request a new code." }
  if (otp.lockedAt) return { ok: false, status: 423, error: "Too many wrong codes. Please request a new code.", locked: true }
  if (otp.expiresAt.getTime() <= nowMs) return { ok: false, status: 400, error: "This code has expired. Please request a new one." }

  if (!codeMatches(otp.id, code, otp.codeHash)) {
    const updated = await prisma.loyaltyOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.loyaltyOtp.update({ where: { id: otp.id }, data: { lockedAt: new Date(nowMs) } })
      return { ok: false, status: 423, error: "Too many wrong codes. Please request a new code.", locked: true, attemptsLeft: 0 }
    }
    const left = OTP_MAX_ATTEMPTS - updated.attempts
    return { ok: false, status: 400, error: `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.`, attemptsLeft: left }
  }
  // Single use: only one caller can consume the code.
  const claimed = await prisma.loyaltyOtp.updateMany({ where: { id: otp.id, consumedAt: null, lockedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } }, data: { consumedAt: new Date(nowMs) } })
  if (claimed.count === 0) return { ok: false, status: 400, error: "This code has already been used. Please request a new one." }
  return { ok: true, otpId: otp.id }
}
