// Housekeeper sessions (separate from the admin session and the member session). SERVER-ONLY.
// HttpOnly cookie holding base64url(JSON) + "." + HMAC-SHA256. The key is HK_SESSION_SECRET, or derived from
// ADMIN_SESSION_SECRET with its own label, so an HK cookie can never pass as an admin or member cookie.
// The session is bound to the HkUser row: it stops working if the user is deactivated, the mobile changes,
// or the PIN is reset (a fingerprint of the PIN hash is part of the payload).

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"

if (typeof window !== "undefined") throw new Error("lib/hk/session is server-only.")

export const HK_COOKIE = "rb_hk_session"
export const HK_SESSION_TTL_SECONDS = 12 * 60 * 60

interface Payload { v: 1; uid: string; ph: string; fp: string; iat: number; exp: number; n: string }

export class HkAuthError extends Error {
  constructor(message = "Please sign in again.") {
    super(message)
    this.name = "HkAuthError"
  }
}

function key(env = process.env): Buffer | null {
  const own = String(env.HK_SESSION_SECRET || "")
  const admin = String(env.ADMIN_SESSION_SECRET || "")
  const base = own.length >= 32 ? own : admin.length >= 32 ? admin : ""
  if (!base) return null
  return createHmac("sha256", base).update("ritumbhara-hk-session-v1").digest()
}

export function hkSessionConfigured(env = process.env) {
  return key(env) !== null
}

export function pinFingerprint(pinHash: string): string {
  return createHash("sha256").update(pinHash).digest("base64url").slice(0, 16)
}

export function createHkToken(user: { id: string; mobile: string; pinHash: string }, nowMs = Date.now()): { token: string; expiresAt: Date } | null {
  const k = key()
  if (!k) return null
  const iat = Math.floor(nowMs / 1000)
  const p: Payload = { v: 1, uid: user.id, ph: user.mobile, fp: pinFingerprint(user.pinHash), iat, exp: iat + HK_SESSION_TTL_SECONDS, n: randomBytes(9).toString("base64url") }
  const body = Buffer.from(JSON.stringify(p)).toString("base64url")
  return { token: body + "." + createHmac("sha256", k).update(body).digest("base64url"), expiresAt: new Date(p.exp * 1000) }
}

export function verifyHkToken(token: string | undefined | null, nowMs = Date.now()): Payload | null {
  const k = key()
  if (!k || !token || token.length > 1024) return null
  const dot = token.indexOf(".")
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), "base64url")
  const expected = createHmac("sha256", k).update(body).digest()
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let p: Payload
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  const now = Math.floor(nowMs / 1000)
  if (!p || p.v !== 1 || typeof p.uid !== "string" || typeof p.ph !== "string" || typeof p.fp !== "string" || typeof p.exp !== "number" || typeof p.iat !== "number") return null
  if (p.exp <= now || p.iat > now + 60 || p.exp - p.iat > HK_SESSION_TTL_SECONDS) return null
  return p
}

export function hkCookieOptions(expiresAt: Date) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires: expiresAt }
}

// The signed-in housekeeper, or null. Re-checks the database row on every call.
export async function getHkSession() {
  const store = await cookies()
  const p = verifyHkToken(store.get(HK_COOKIE)?.value)
  if (!p) return null
  const u = await prisma.hkUser.findUnique({ where: { id: p.uid } })
  if (!u || !u.isActive || u.mobile !== p.ph || pinFingerprint(u.pinHash) !== p.fp) return null
  return u
}

// For server actions and API routes: throws HkAuthError when not signed in.
export async function assertHk() {
  const u = await getHkSession()
  if (!u) throw new HkAuthError()
  return u
}

// For pages: sends a signed-out housekeeper to the HK login page.
export async function requireHk() {
  const u = await getHkSession()
  if (!u) redirect("/hk/login")
  return u
}
