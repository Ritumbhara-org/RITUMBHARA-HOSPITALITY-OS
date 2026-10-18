"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  createSessionToken, getAuthConfig, safeEqualText, safeNextPath, SESSION_COOKIE, sessionCookieOptions, verifyPassword,
} from "@/lib/auth/session"
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/auth/rate-limit"

// `username` is echoed back on failure so the form keeps it (the password field is always cleared).
export type LoginState = { error: string | null; username?: string }

async function clientKey(): Promise<string> {
  const h = await headers()
  const forwarded = (h.get("x-forwarded-for") || "").split(",")[0].trim()
  return "ip:" + (forwarded || h.get("x-real-ip") || "unknown")
}

// Checks the admin username and password on the server and, if they match, starts a session.
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim()
  const password = String(formData.get("password") || "")
  const next = safeNextPath(formData.get("next"))

  const cfg = getAuthConfig()
  if (!cfg.ok) {
    console.error("[auth] login is not configured; missing or invalid:", cfg.missing.join(", "))
    return { error: "Sign-in is not set up on this server yet. Please contact the administrator." }
  }

  const key = await clientKey()
  if (loginBlocked(key)) {
    return { error: "Too many failed attempts. Please wait 15 minutes and try again.", username }
  }

  // Always run the password check, even for a wrong username, so the response time does not reveal which part was wrong.
  const passwordOk = await verifyPassword(password, cfg.config.passwordHash)
  const usernameOk = safeEqualText(username.toLowerCase(), cfg.config.username.toLowerCase())
  if (!passwordOk || !usernameOk || !username) {
    recordLoginFailure(key)
    return { error: "Incorrect username or password.", username }
  }

  clearLoginFailures(key)
  const { token, expiresAt } = createSessionToken(cfg.config)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  redirect(next)
}

// Ends the session: the cookie is removed from the browser and the user is sent to the login page.
export async function logoutAction(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 })
  redirect("/login")
}
