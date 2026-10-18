// Test helpers for admin authentication: a test admin account, its env config, and a fake next/headers
// cookie/header store that the code under test reads through `cookies()` / `headers()`.

import { createSessionToken, getAuthConfig, hashPassword } from "../../lib/auth/session"

export const TEST_ADMIN = { username: "admin@ritumbhara.test", password: "correct horse battery staple" }
export const TEST_SESSION_SECRET = "test-session-secret-0123456789-abcdefghijklmnop"

// Low scrypt cost keeps tests fast; production hashes use the defaults in lib/auth/session.ts.
export const testPasswordHashPromise = hashPassword(TEST_ADMIN.password, { N: 1024 })

export async function setAuthEnv() {
  process.env.ADMIN_USERNAME = TEST_ADMIN.username
  process.env.ADMIN_PASSWORD_HASH = await testPasswordHashPromise
  process.env.ADMIN_SESSION_SECRET = TEST_SESSION_SECRET
}

export function clearAuthEnv() {
  delete process.env.ADMIN_USERNAME
  delete process.env.ADMIN_PASSWORD_HASH
  delete process.env.ADMIN_SESSION_SECRET
}

export function validSessionToken(nowMs?: number): string {
  const cfg = getAuthConfig()
  if (!cfg.ok) throw new Error("auth env not set")
  return createSessionToken(cfg.config, nowMs).token
}

export interface SetCookie { name: string; value: string; options: Record<string, unknown> }

// A minimal stand-in for the object returned by next/headers cookies().
export class FakeCookieStore {
  values = new Map<string, string>()
  sets: SetCookie[] = []
  get(name: string) {
    return this.values.has(name) ? { name, value: this.values.get(name) as string } : undefined
  }
  set(name: string, value: string, options: Record<string, unknown> = {}) {
    this.sets.push({ name, value, options })
    if (value === "" || options.maxAge === 0) this.values.delete(name)
    else this.values.set(name, value)
  }
  delete(name: string) {
    this.values.delete(name)
  }
  clear() {
    this.values.clear()
    this.sets = []
  }
}

export const fakeCookies = new FakeCookieStore()
export const fakeHeaders = new Headers()

export const nextHeadersMock = {
  namedExports: {
    cookies: async () => fakeCookies,
    headers: async () => fakeHeaders,
  },
}
