// Authentication for machine-to-machine cron endpoints (/api/cron/*). SERVER-ONLY.
//
// The cron service (cron-job.org, or Vercel Cron) must send:   Authorization: Bearer <CRON_SECRET>
// Rules:
//   - CRON_SECRET missing, blank or shorter than MIN_CRON_SECRET_LENGTH -> every cron request is refused (503).
//     A missing setting never opens the endpoint.
//   - Wrong, missing or malformed Authorization header -> 401.
//   - The secret is only accepted in the Authorization header (never in the URL, where it would end up in logs).
//   - An admin browser session does NOT grant access: these endpoints are for the cron service only.
// The comparison is constant-time. The secret is never logged or returned.

import { createHmac, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

if (typeof window !== "undefined") {
  throw new Error("lib/auth/cron is server-only and must not be imported in browser code.")
}

export const MIN_CRON_SECRET_LENGTH = 16

export type CronAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: "unauthorized" | "cron_not_configured" }

function digest(value: string): Buffer {
  return createHmac("sha256", "cron-secret-compare").update(value).digest()
}

export function checkCronAuth(authorization: string | null | undefined, env: Record<string, string | undefined> = process.env): CronAuthResult {
  const secret = String(env.CRON_SECRET || "").trim()
  if (secret.length < MIN_CRON_SECRET_LENGTH) return { ok: false, status: 503, error: "cron_not_configured" }
  const header = String(authorization || "")
  const m = header.match(/^Bearer ([^\s]+)$/)
  if (!m) return { ok: false, status: 401, error: "unauthorized" }
  return timingSafeEqual(digest(m[1]), digest(secret)) ? { ok: true } : { ok: false, status: 401, error: "unauthorized" }
}

// For route handlers: returns the error response to send back, or null when the cron service is authenticated.
// Call it first, before any work and outside any try/catch that turns errors into 200 responses.
export function cronGuard(request: Request): NextResponse | null {
  const result = checkCronAuth(request.headers.get("authorization"))
  if (result.ok) return null
  if (result.error === "cron_not_configured") {
    console.error("[cron] refused: CRON_SECRET is not configured (missing or shorter than " + MIN_CRON_SECRET_LENGTH + " characters)")
  }
  return NextResponse.json({ success: false, error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } })
}
