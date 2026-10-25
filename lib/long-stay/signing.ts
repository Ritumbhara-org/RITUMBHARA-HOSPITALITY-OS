// Public e-sign flow for one agreement, reached only through its link token. SERVER-ONLY.
// Each function finds the agreement by the token's hash and touches nothing but that agreement and its booking.

import { put } from "./blob"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/utils/phone"
import { emailSendingConfigured, sendEmailReply } from "@/lib/inbox/email-send"
import {
  isLinkUsable, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS, OTP_RESEND_GAP_MS, OTP_TTL_MS, VERIFIED_WINDOW_MS, type AgreementSnapshot,
} from "./agreement"
import { agreementPrefix } from "./shared"
import { buildSignedAgreementPdf, istTimestamp } from "./pdf"
import { hashOtp, hashToken, isWellFormedToken, maskPhone, newOtp, otpMatches, sendLongStayWhatsApp, snapshotHash } from "./server"

export type SigningState = "ACTIVE" | "SIGNED" | "EXPIRED" | "VOIDED" | "LOCKED" | "NOT_FOUND"

export async function findAgreementByToken(token: string) {
  if (!isWellFormedToken(token)) return null
  return prisma.longStayAgreement.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { booking: { select: { id: true, contactNumber: true, email: true, guestName: true } } },
  })
}

type Agreement = NonNullable<Awaited<ReturnType<typeof findAgreementByToken>>>

export function signingState(a: Agreement | null, nowMs = Date.now()): SigningState {
  if (!a) return "NOT_FOUND"
  if (a.status === "SIGNED") return "SIGNED"
  if (a.status === "VOIDED") return "VOIDED"
  if (a.lockedAt) return "LOCKED"
  if (!isLinkUsable(a, nowMs)) return "EXPIRED"
  return "ACTIVE"
}

export const STATE_MESSAGE: Record<Exclude<SigningState, "ACTIVE">, string> = {
  SIGNED: "This agreement is already signed.",
  EXPIRED: "This signing link has expired. Please ask Ritumbhara to send a new one.",
  VOIDED: "This signing link is no longer valid. Please ask Ritumbhara for a new one.",
  LOCKED: "This link is locked after too many wrong codes. Please ask Ritumbhara to send a new one.",
  NOT_FOUND: "This signing link isn't valid. Please check the link or ask Ritumbhara for a new one.",
}

export type FlowResult = { ok: true; data?: Record<string, unknown> } | { ok: false; status: number; error: string; data?: Record<string, unknown> }

function stateError(state: SigningState): FlowResult {
  if (state === "ACTIVE") return { ok: true }
  return { ok: false, status: state === "NOT_FOUND" ? 404 : 410, error: STATE_MESSAGE[state], data: { state } }
}

// Marks a freshly opened link as Viewed.
export async function markViewed(a: Agreement) {
  if (a.status !== "SENT") return
  await prisma.longStayAgreement.updateMany({ where: { id: a.id, status: "SENT" }, data: { status: "VIEWED", viewedAt: new Date() } })
}

export async function requestOtp(token: string, nowMs = Date.now()): Promise<FlowResult> {
  const a = await findAgreementByToken(token)
  const state = signingState(a, nowMs)
  if (!a || state !== "ACTIVE") return stateError(state)

  if (a.otpSendCount >= OTP_MAX_SENDS) {
    return { ok: false, status: 429, error: "Too many codes requested for this link. Please ask Ritumbhara for a new link." }
  }
  if (a.otpLastSentAt && nowMs - a.otpLastSentAt.getTime() < OTP_RESEND_GAP_MS) {
    const wait = Math.ceil((OTP_RESEND_GAP_MS - (nowMs - a.otpLastSentAt.getTime())) / 1000)
    return { ok: false, status: 429, error: `Please wait ${wait} seconds before asking for another code.`, data: { retryAfter: wait } }
  }

  const otp = newOtp()
  const now = new Date(nowMs)
  // Conditional update so two quick taps can't both send a code.
  const claimed = await prisma.longStayAgreement.updateMany({
    where: { id: a.id, otpSendCount: a.otpSendCount, status: { in: ["SENT", "VIEWED"] } },
    data: {
      otpHash: hashOtp(a.id, otp), otpExpiresAt: new Date(nowMs + OTP_TTL_MS), otpSendCount: { increment: 1 }, otpLastSentAt: now,
      phoneVerifiedAt: null, phoneVerified: null, status: "VIEWED", viewedAt: a.viewedAt ?? now,
    },
  })
  if (claimed.count === 0) return { ok: false, status: 429, error: "A code was just sent. Please check WhatsApp." }

  const sent = await sendLongStayWhatsApp({
    to: a.booking.contactNumber, kind: "OTP", bookingId: a.bookingId,
    body: `${otp} is your Ritumbhara agreement code. It is valid for 10 minutes. Don't share it with anyone.`,
    logBody: "Agreement OTP sent (code hidden)",
    variables: { "1": otp },
  })
  if (!sent.ok) return { ok: false, status: 502, error: "We couldn't send the code on WhatsApp. Please try again in a minute." }
  return { ok: true, data: { sentTo: maskPhone(a.booking.contactNumber), expiresInSeconds: OTP_TTL_MS / 1000 } }
}

export async function verifyOtp(token: string, otp: string, nowMs = Date.now()): Promise<FlowResult> {
  const a = await findAgreementByToken(token)
  const state = signingState(a, nowMs)
  if (!a || state !== "ACTIVE") return stateError(state)
  const code = String(otp ?? "").replace(/\D/g, "")
  if (!a.otpHash || !a.otpExpiresAt) return { ok: false, status: 400, error: "Please request a code first." }
  if (a.otpExpiresAt.getTime() < nowMs) return { ok: false, status: 400, error: "This code has expired. Please request a new one." }

  if (!otpMatches(a.id, code, a.otpHash)) {
    const updated = await prisma.longStayAgreement.update({ where: { id: a.id }, data: { otpAttempts: { increment: 1 } } })
    if (updated.otpAttempts >= OTP_MAX_ATTEMPTS) {
      await prisma.longStayAgreement.update({ where: { id: a.id }, data: { lockedAt: new Date(nowMs), otpHash: null } })
      return { ok: false, status: 423, error: STATE_MESSAGE.LOCKED, data: { state: "LOCKED" } }
    }
    const left = OTP_MAX_ATTEMPTS - updated.otpAttempts
    return { ok: false, status: 400, error: `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.`, data: { attemptsLeft: left } }
  }

  await prisma.longStayAgreement.update({
    where: { id: a.id },
    data: { otpHash: null, otpExpiresAt: null, phoneVerifiedAt: new Date(nowMs), phoneVerified: normalizePhoneNumber(a.booking.contactNumber) },
  })
  return { ok: true }
}

export interface SignInput {
  name: string
  signature: string // data:image/png;base64,...
  agree: boolean
  ip: string
  userAgent: string
  pdfBaseUrl: string // public base URL for the signed-PDF link sent to the guest
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const MAX_SIGNATURE_BYTES = 1024 * 1024

export function decodeSignature(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "")
  if (!m) return null
  const bytes = Buffer.from(m[1], "base64")
  if (bytes.length < 100 || bytes.length > MAX_SIGNATURE_BYTES) return null
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return null
  return new Uint8Array(bytes)
}

export async function signAgreement(token: string, input: SignInput, nowMs = Date.now()): Promise<FlowResult> {
  const a = await findAgreementByToken(token)
  const state = signingState(a, nowMs)
  if (!a || state !== "ACTIVE") return stateError(state)

  if (!a.phoneVerifiedAt || nowMs - a.phoneVerifiedAt.getTime() > VERIFIED_WINDOW_MS) {
    return { ok: false, status: 400, error: "Please verify your phone with the WhatsApp code first.", data: { needOtp: true } }
  }
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim()
  if (name.length < 2 || name.length > 120) return { ok: false, status: 400, error: "Please type your full name." }
  if (input.agree !== true) return { ok: false, status: 400, error: "Please tick the box to agree." }
  const png = decodeSignature(input.signature)
  if (!png) return { ok: false, status: 400, error: "Please draw your signature." }

  const snapshot = a.snapshot as unknown as AgreementSnapshot
  if (snapshotHash(snapshot) !== a.snapshotHash) {
    console.error("[Long Stay] agreement snapshot hash mismatch", a.id)
    return { ok: false, status: 409, error: "This agreement can't be signed. Please ask Ritumbhara for a new link." }
  }

  const signedAt = new Date(nowMs)
  const prefix = agreementPrefix(a.bookingId)
  try {
    const sigBlob = await put(`${prefix}signature-${a.id}.png`, Buffer.from(png), { access: "private", contentType: "image/png", addRandomSuffix: true })
    const pdf = await buildSignedAgreementPdf(snapshot, png, {
      signerName: name,
      signedAtIst: istTimestamp(signedAt),
      phoneVerified: a.phoneVerified || normalizePhoneNumber(a.booking.contactNumber),
      phoneVerifiedAtIst: istTimestamp(a.phoneVerifiedAt),
      ip: input.ip,
      userAgent: input.userAgent,
      agreementHash: a.snapshotHash,
      agreementId: a.id,
    })
    const pdfBlob = await put(`${prefix}agreement-${a.id}.pdf`, Buffer.from(pdf), { access: "private", contentType: "application/pdf", addRandomSuffix: true })

    // Only an agreement that is still open can become Signed (staff may have voided it a moment ago).
    const done = await prisma.longStayAgreement.updateMany({
      where: { id: a.id, status: { in: ["SENT", "VIEWED"] }, lockedAt: null },
      data: {
        status: "SIGNED", signedAt, signerName: name, signaturePath: sigBlob.pathname, pdfPath: pdfBlob.pathname,
        signerIp: input.ip.slice(0, 100), signerUserAgent: input.userAgent.slice(0, 500),
      },
    })
    if (done.count === 0) return { ok: false, status: 410, error: STATE_MESSAGE.VOIDED }
    await prisma.longStayBooking.update({ where: { id: a.bookingId }, data: { termsAccepted: true } })
  } catch (err) {
    console.error("[Long Stay] signing failed", err)
    return { ok: false, status: 500, error: "Something went wrong while signing. Please try again." }
  }

  const pdfLink = `${input.pdfBaseUrl}/api/sign/${token}/pdf`
  const first = a.booking.guestName.split(" ")[0] || a.booking.guestName
  await sendLongStayWhatsApp({
    to: a.booking.contactNumber, kind: "SIGNED", bookingId: a.bookingId,
    body: `Thank you ${first}. Your Ritumbhara stay agreement is signed. Download your copy: ${pdfLink}`,
    variables: { "1": first, "2": pdfLink },
  })
  if (a.booking.email && emailSendingConfigured()) {
    await sendEmailReply({
      to: a.booking.email,
      subject: "Your signed Ritumbhara stay agreement",
      text: `Hi ${first},\n\nThank you for signing your stay agreement. You can download your signed copy here:\n${pdfLink}\n\nRitumbhara Hospitality`,
    }).catch((err) => console.error("[Long Stay] signed email failed", err))
  }
  return { ok: true, data: { pdfUrl: `/api/sign/${token}/pdf` } }
}
