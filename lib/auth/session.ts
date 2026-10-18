// Admin authentication core: password verification and signed session tokens. SERVER-ONLY.
//
// One admin account, configured only through server-side environment variables:
//   ADMIN_USERNAME        - the login name (an email address is fine)
//   ADMIN_PASSWORD_HASH   - scrypt hash of the password, made with `npm run auth:hash-password`
//                           (the plaintext password is never stored anywhere)
//   ADMIN_SESSION_SECRET  - random string, at least 32 characters, used to sign session cookies
// If any of them is missing or malformed, login is disabled and every protected route stays closed (fail closed).
//
// Session = an HttpOnly cookie holding a signed token: base64url(JSON payload) + "." + HMAC-SHA256 signature.
// The signing key is derived from ADMIN_SESSION_SECRET + ADMIN_USERNAME + ADMIN_PASSWORD_HASH, so changing the
// password, the username or the secret immediately invalidates every existing session.
// Sessions expire after SESSION_TTL_SECONDS (absolute; no sliding renewal). The token holds no password.

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto"

if (typeof window !== "undefined") {
  throw new Error("lib/auth/session is server-only and must not be imported in browser code.")
}

export const SESSION_COOKIE = "os_admin_session"
export const SESSION_TTL_SECONDS = 12 * 60 * 60 // 12 hours
const TOKEN_VERSION = 1
const MIN_SECRET_LENGTH = 32

// ---------- configuration ----------

export interface AuthConfig {
  username: string
  passwordHash: string
  sessionSecret: string
}

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; missing: string[] }

export function getAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfigResult {
  const username = String(env.ADMIN_USERNAME || "").trim()
  const passwordHash = String(env.ADMIN_PASSWORD_HASH || "").trim()
  const sessionSecret = String(env.ADMIN_SESSION_SECRET || "")
  const missing: string[] = []
  if (!username) missing.push("ADMIN_USERNAME")
  if (!parsePasswordHash(passwordHash)) missing.push("ADMIN_PASSWORD_HASH")
  if (sessionSecret.length < MIN_SECRET_LENGTH) missing.push("ADMIN_SESSION_SECRET")
  if (missing.length) return { ok: false, missing }
  return { ok: true, config: { username, passwordHash, sessionSecret } }
}

// ---------- password hashing (scrypt) ----------
// Stored format: scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>

const SCRYPT_DEFAULTS = { N: 32768, r: 8, p: 1, keyLength: 64 }

interface ParsedHash { N: number; r: number; p: number; salt: Buffer; hash: Buffer }

function parsePasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return null
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 1048576 || (N & (N - 1)) !== 0) return null
  const salt = Buffer.from(parts[4], "base64url")
  const hash = Buffer.from(parts[5], "base64url")
  if (salt.length < 16 || hash.length < 32) return null
  return { N, r, p, salt, hash }
}

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keyLength, { ...options, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export async function hashPassword(password: string, opts: Partial<typeof SCRYPT_DEFAULTS> = {}): Promise<string> {
  if (password.length < 12) throw new Error("Use a password of at least 12 characters.")
  const o = { ...SCRYPT_DEFAULTS, ...opts }
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, o.keyLength, { N: o.N, r: o.r, p: o.p })
  return ["scrypt", o.N, o.r, o.p, salt.toString("base64url"), key.toString("base64url")].join("$")
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored)
  if (!parsed || typeof password !== "string" || password.length === 0 || password.length > 1024) return false
  const key = await scrypt(password, parsed.salt, parsed.hash.length, { N: parsed.N, r: parsed.r, p: parsed.p })
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash)
}

// Constant-time comparison for the username (no early exit on the first different character).
export function safeEqualText(a: string, b: string): boolean {
  const ha = createHmac("sha256", "username-compare").update(a).digest()
  const hb = createHmac("sha256", "username-compare").update(b).digest()
  return timingSafeEqual(ha, hb)
}

// ---------- session tokens ----------

export interface SessionPayload {
  v: number
  sub: "admin"
  u: string // username
  iat: number // issued at (seconds)
  exp: number // expires at (seconds)
  n: string // random nonce, so two tokens issued in the same second still differ
}

function signingKey(config: AuthConfig): Buffer {
  return createHmac("sha256", config.sessionSecret)
    .update("os-admin-session\u0000" + config.username + "\u0000" + config.passwordHash)
    .digest()
}

function sign(data: string, config: AuthConfig): string {
  return createHmac("sha256", signingKey(config)).update(data).digest("base64url")
}

export function createSessionToken(config: AuthConfig, nowMs: number = Date.now()): { token: string; expiresAt: Date } {
  const iat = Math.floor(nowMs / 1000)
  const payload: SessionPayload = { v: TOKEN_VERSION, sub: "admin", u: config.username, iat, exp: iat + SESSION_TTL_SECONDS, n: randomBytes(12).toString("base64url") }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return { token: body + "." + sign(body, config), expiresAt: new Date(payload.exp * 1000) }
}

// Returns the session if the token is genuine, unexpired and for the configured admin; otherwise null.
export function verifySessionToken(token: string | undefined | null, config: AuthConfig, nowMs: number = Date.now()): SessionPayload | null {
  if (!token || token.length > 2048) return null
  const dot = token.indexOf(".")
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), "base64url")
  const expected = Buffer.from(sign(body, config), "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload
  } catch {
    return null
  }
  const now = Math.floor(nowMs / 1000)
  if (!payload || payload.v !== TOKEN_VERSION || payload.sub !== "admin" || typeof payload.exp !== "number" || typeof payload.iat !== "number") return null
  if (payload.exp <= now || payload.iat > now + 60 || payload.exp - payload.iat > SESSION_TTL_SECONDS) return null
  if (payload.u !== config.username) return null
  return payload
}

// Session check for code that has the raw cookie value (proxy, route handlers). Fails closed when unconfigured.
export function isValidSession(token: string | undefined | null, env: Record<string, string | undefined> = process.env, nowMs: number = Date.now()): boolean {
  const cfg = getAuthConfig(env)
  return cfg.ok && verifySessionToken(token, cfg.config, nowMs) !== null
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  }
}

// ---------- redirects ----------

// Only same-site relative paths are allowed after login (no open redirect to another site).
export function safeNextPath(next: unknown): string {
  const s = typeof next === "string" ? next : ""
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || /[\u0000-\u001f\\]/.test(s) || s.length > 512) return "/dashboard"
  if (s === "/login" || s.startsWith("/login?") || s.startsWith("/login/")) return "/dashboard"
  return s
}
