// Member portal sessions (separate from the admin session). SERVER-ONLY.
// An HttpOnly cookie holding base64url(JSON) + "." + HMAC-SHA256. The key is MEMBER_SESSION_SECRET, or derived
// from ADMIN_SESSION_SECRET with a separate label, so a member cookie can never pass as an admin cookie (and the
// other way round). Without a secret of at least 32 characters, sign-in is disabled (fail closed).
// The session is bound to the member's phone: if the registered number changes, old sessions stop working.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

if (typeof window !== "undefined") throw new Error("lib/loyalty/member-session is server-only.")

export const MEMBER_COOKIE = "rb_member_session"
export const MEMBER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

interface Payload { v: 1; mid: string; ph: string; iat: number; exp: number; n: string }

function key(env = process.env): Buffer | null {
  const own = String(env.MEMBER_SESSION_SECRET || "")
  const admin = String(env.ADMIN_SESSION_SECRET || "")
  const base = own.length >= 32 ? own : admin.length >= 32 ? admin : ""
  if (!base) return null
  return createHmac("sha256", base).update("ritumbhara-member-session-v1").digest()
}

export function memberSessionConfigured(env = process.env) {
  return key(env) !== null
}

export function createMemberToken(membershipId: string, phone: string, nowMs = Date.now()): { token: string; expiresAt: Date } | null {
  const k = key()
  if (!k) return null
  const iat = Math.floor(nowMs / 1000)
  const p: Payload = { v: 1, mid: membershipId, ph: phone, iat, exp: iat + MEMBER_SESSION_TTL_SECONDS, n: randomBytes(9).toString("base64url") }
  const body = Buffer.from(JSON.stringify(p)).toString("base64url")
  return { token: body + "." + createHmac("sha256", k).update(body).digest("base64url"), expiresAt: new Date(p.exp * 1000) }
}

export function verifyMemberToken(token: string | undefined | null, nowMs = Date.now()): Payload | null {
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
  if (!p || p.v !== 1 || typeof p.mid !== "string" || typeof p.ph !== "string" || typeof p.exp !== "number") return null
  if (p.exp <= now || p.iat > now + 60 || p.exp - p.iat > MEMBER_SESSION_TTL_SECONDS) return null
  return p
}

export function memberCookieOptions(expiresAt: Date) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires: expiresAt }
}

// The signed-in member, or null. Checks the membership still exists with the same phone.
export async function getMemberSession() {
  const store = await cookies()
  const p = verifyMemberToken(store.get(MEMBER_COOKIE)?.value)
  if (!p) return null
  const m = await prisma.membership.findUnique({ where: { id: p.mid } })
  if (!m || m.phone !== p.ph) return null
  return m
}
