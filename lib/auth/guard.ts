// Server-side authorization checks for pages, server actions and API routes. SERVER-ONLY.
// The proxy (proxy.ts) is only a first, optimistic gate; every protected page, action and API route also checks
// the session itself, close to the data, so nothing depends on the proxy or on client-side state.

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { getAuthConfig, SESSION_COOKIE, verifySessionToken, type SessionPayload } from "./session"

if (typeof window !== "undefined") {
  throw new Error("lib/auth/guard is server-only and must not be imported in browser code.")
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in. Please sign in to the OS again.")
    this.name = "UnauthorizedError"
  }
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const cfg = getAuthConfig()
  if (!cfg.ok) return null
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, cfg.config)
}

// Pages: send signed-out visitors to the login page.
export async function requireAdminPage(nextPath?: string): Promise<SessionPayload> {
  const session = await getAdminSession()
  if (!session) redirect(nextPath ? "/login?next=" + encodeURIComponent(nextPath) : "/login")
  return session
}

// Server actions and server-side data functions: refuse to run without a valid admin session.
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getAdminSession()
  if (!session) throw new UnauthorizedError()
  return session
}

// API route handlers: returns a 401 response to send back, or null when the admin is signed in.
export async function adminApiGuard(): Promise<NextResponse | null> {
  const session = await getAdminSession()
  if (session) return null
  return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
}
