// Long Stays server helpers: tokens, OTPs, hashes, WhatsApp sends and the app's public URL. SERVER-ONLY.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import twilio from "twilio"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/utils/phone"
import { canonicalJson, type AgreementSnapshot } from "./agreement"

if (typeof window !== "undefined") {
  throw new Error("lib/long-stay/server is server-only and must not be imported in browser code.")
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex")
}

export function snapshotHash(s: AgreementSnapshot): string {
  return sha256Hex(canonicalJson(s))
}

// A random 32-byte link token. Only its hash is stored.
export function newSigningToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, tokenHash: hashToken(token) }
}

export function hashToken(token: string): string {
  return sha256Hex("long-stay-sign:" + token)
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,50}$/.test(token ?? "")
}

function otpSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.CRON_SECRET || "long-stay-otp"
}

export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

// Keyed hash, bound to one agreement, so a 6-digit code can't be looked up from the database alone.
export function hashOtp(agreementId: string, otp: string): string {
  return createHmac("sha256", otpSecret()).update(agreementId + ":" + otp).digest("hex")
}

export function otpMatches(agreementId: string, otp: string, storedHash: string | null): boolean {
  if (!storedHash || !/^\d{6}$/.test(otp)) return false
  const a = Buffer.from(hashOtp(agreementId, otp), "hex")
  const b = Buffer.from(storedHash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export function maskPhone(phone: string): string {
  const d = normalizePhoneNumber(phone)
  if (d.length < 6) return d
  return d.slice(0, 3) + " ••••• " + d.slice(-4)
}

// Base URL for links sent to guests. NEXT_PUBLIC_APP_URL wins; otherwise the request's own host.
export function publicBaseUrl(host: string | null, proto: string | null): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
  if (fromEnv) return fromEnv
  if (host) return `${proto || "https"}://${host}`
  return "https://ritumbhara-hospitality-os-q6er.vercel.app"
}

export function signingUrl(base: string, token: string): string {
  return `${base}/sign/${token}`
}

// ---------- WhatsApp ----------
// Messages the business starts need approved WhatsApp templates. Put the Twilio Content SIDs in:
//   LONG_STAY_SIGN_TEMPLATE_SID   variables {{1}} guest name, {{2}} signing link
//   LONG_STAY_OTP_TEMPLATE_SID    variables {{1}} 6-digit code
//   LONG_STAY_SIGNED_TEMPLATE_SID variables {{1}} guest name, {{2}} signed PDF link
// Without a SID the plain text is sent, which WhatsApp only delivers inside a 24-hour customer-service window.

export type LongStayMessageKind = "SIGN_LINK" | "OTP" | "SIGNED"

const TEMPLATE_ENV: Record<LongStayMessageKind, string> = {
  SIGN_LINK: "LONG_STAY_SIGN_TEMPLATE_SID",
  OTP: "LONG_STAY_OTP_TEMPLATE_SID",
  SIGNED: "LONG_STAY_SIGNED_TEMPLATE_SID",
}

export interface WhatsAppSend {
  to: string
  kind: LongStayMessageKind
  body: string
  variables: Record<string, string>
  bookingId: string
  logBody?: string // what goes into the message log (the OTP is masked)
}

export async function sendLongStayWhatsApp(msg: WhatsAppSend): Promise<{ ok: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER
  const contentSid = process.env[TEMPLATE_ENV[msg.kind]]
  const to = normalizePhoneNumber(msg.to)
  let status = "PENDING"
  let error: string | undefined

  if (!to) return { ok: false, error: "The booking has no valid contact number." }

  try {
    if (!accountSid || !authToken || !fromNumber) {
      if (process.env.NODE_ENV === "production") {
        status = "FAILED"
        error = "WhatsApp (Twilio) isn't set up on this deployment."
      } else {
        console.log(`[Long Stay WhatsApp sandbox] to ${to}: ${msg.body}`)
        status = "SANDBOX_DELIVERED"
      }
    } else {
      const client = twilio(accountSid, authToken)
      const params: Record<string, string> = { to: `whatsapp:${to}`, from: `whatsapp:${normalizePhoneNumber(fromNumber)}` }
      if (contentSid) {
        params.contentSid = contentSid
        params.contentVariables = JSON.stringify(msg.variables)
      } else {
        params.body = msg.body
      }
      await client.messages.create(params as never)
      status = "DELIVERED"
    }
  } catch (err) {
    status = "FAILED"
    error = "WhatsApp message could not be sent: " + (err instanceof Error ? err.message : String(err))
    console.error("[Long Stay WhatsApp]", error)
  }

  try {
    await prisma.whatsAppMessage.create({
      data: {
        direction: "OUTBOUND", from: fromNumber || "SYSTEM", to, messageType: contentSid ? "template" : "text",
        content: msg.logBody ?? msg.body, templateName: contentSid ? "long_stay_" + msg.kind.toLowerCase() : null, status,
        relatedEntityType: "LONG_STAY", relatedEntityId: msg.bookingId,
      },
    })
  } catch (dbErr) {
    console.error("[Long Stay WhatsApp log]", dbErr)
  }
  return status === "FAILED" ? { ok: false, error } : { ok: true }
}
