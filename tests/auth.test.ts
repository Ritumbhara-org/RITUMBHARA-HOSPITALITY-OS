// Admin authentication tests: password + session primitives, login/logout actions, the proxy gate, and proof
// that every admin server action and admin API route refuses unauthenticated calls (without touching data).
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { NextRequest } from "next/server"
import {
  createSessionToken, getAuthConfig, hashPassword, isValidSession, safeNextPath, SESSION_COOKIE, SESSION_TTL_SECONDS,
  verifyPassword, verifySessionToken, type AuthConfig,
} from "../lib/auth/session"
import { isPublicPath } from "../lib/auth/policy"
import { resetLoginRateLimit } from "../lib/auth/rate-limit"
import {
  clearAuthEnv, fakeCookies, fakeHeaders, nextHeadersMock, setAuthEnv, TEST_ADMIN, testPasswordHashPromise, validSessionToken,
} from "./helpers/auth-env"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

// Any database access from an unauthenticated call is a failure: the fake Prisma records it and throws.
const prismaTouches: string[] = []
const prismaTrap: unknown = new Proxy({}, {
  get(_t, model) {
    if (model === "then") return undefined
    prismaTouches.push(String(model))
    throw new Error("database touched without authentication: " + String(model))
  },
})
mock.module("next/headers", nextHeadersMock)
mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } })
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: prismaTrap }, defaultExport: prismaTrap })

function redirectTarget(err: unknown): string {
  const digest = String((err as { digest?: string }).digest || "")
  const m = digest.match(/^NEXT_REDIRECT;[^;]*;([^;]+);/)
  return m ? m[1] : ""
}

async function config(): Promise<AuthConfig> {
  await setAuthEnv()
  const cfg = getAuthConfig()
  if (!cfg.ok) throw new Error("bad test config")
  return cfg.config
}

beforeEach(async () => {
  await setAuthEnv()
  fakeCookies.clear()
  for (const k of Array.from(fakeHeaders.keys())) fakeHeaders.delete(k)
  resetLoginRateLimit()
  prismaTouches.length = 0
})

// ---------- passwords ----------

test("password hashes verify the right password only, and never contain it", async () => {
  const hash = await testPasswordHashPromise
  assert.match(hash, /^scrypt\$1024\$8\$1\$[\w-]+\$[\w-]+$/)
  assert.ok(!hash.includes(TEST_ADMIN.password))
  assert.equal(await verifyPassword(TEST_ADMIN.password, hash), true)
  assert.equal(await verifyPassword(TEST_ADMIN.password + " ", hash), false)
  assert.equal(await verifyPassword("", hash), false)
  assert.equal(await verifyPassword(TEST_ADMIN.password, "plaintext-password"), false)
  await assert.rejects(hashPassword("short"), /at least 12/)
})

test("auth config fails closed: missing, plaintext or weak values disable login", () => {
  assert.deepEqual(getAuthConfig({}), { ok: false, missing: ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET"] })
  const r = getAuthConfig({ ADMIN_USERNAME: "a", ADMIN_PASSWORD_HASH: "password123", ADMIN_SESSION_SECRET: "short" })
  assert.deepEqual(r, { ok: false, missing: ["ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET"] })
  assert.equal(isValidSession("anything", {}), false)
})

// ---------- session tokens ----------

test("session tokens: valid until expiry, then refused", async () => {
  const cfg = await config()
  const now = Date.parse("2026-10-18T09:00:00Z")
  const { token, expiresAt } = createSessionToken(cfg, now)
  assert.equal(expiresAt.getTime(), now + SESSION_TTL_SECONDS * 1000)
  assert.equal(verifySessionToken(token, cfg, now)?.u, TEST_ADMIN.username)
  assert.ok(verifySessionToken(token, cfg, now + (SESSION_TTL_SECONDS - 1) * 1000))
  assert.equal(verifySessionToken(token, cfg, now + SESSION_TTL_SECONDS * 1000), null)
  assert.ok(!token.includes(TEST_ADMIN.password) && !Buffer.from(token.split(".")[0], "base64url").toString().includes(TEST_ADMIN.password))
})

test("session tokens: tampering, forging, other secrets and garbage are refused", async () => {
  const cfg = await config()
  const { token } = createSessionToken(cfg)
  const [body, sig] = token.split(".")
  const payload = JSON.parse(Buffer.from(body, "base64url").toString())
  const reencode = (p: object) => Buffer.from(JSON.stringify(p)).toString("base64url")
  const attempts = [
    reencode({ ...payload, exp: payload.exp + 86400 }) + "." + sig, // extend expiry, keep old signature
    reencode({ ...payload, u: "someone-else" }) + "." + sig,
    body + "." + sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"),
    body + ".", "." + sig, body, "", "null", "admin", token + "." + sig,
    createSessionToken({ ...cfg, sessionSecret: "another-secret-another-secret-another-secret" }).token,
  ]
  for (const t of attempts) assert.equal(verifySessionToken(t, cfg), null, t.slice(0, 20))
  // A token claiming a lifetime longer than the TTL is refused even if correctly signed by someone with the key.
  assert.equal(verifySessionToken(token, cfg, Date.now() - 120 * 1000), null) // issued "in the future"
})

test("changing the password, username or secret signs every existing session out", async () => {
  const cfg = await config()
  const { token } = createSessionToken(cfg)
  assert.ok(verifySessionToken(token, cfg))
  assert.equal(verifySessionToken(token, { ...cfg, passwordHash: await hashPassword("a brand new password!", { N: 1024 }) }), null)
  assert.equal(verifySessionToken(token, { ...cfg, username: "new-admin" }), null)
  assert.equal(verifySessionToken(token, { ...cfg, sessionSecret: cfg.sessionSecret + "-rotated" }), null)
})

test("safeNextPath only allows same-site paths after login", () => {
  assert.equal(safeNextPath("/leads?status=New"), "/leads?status=New")
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, "/login", "/login?next=/x", "leads"]) {
    assert.equal(safeNextPath(bad), "/dashboard", String(bad))
  }
})

// ---------- login / logout actions ----------

async function loginWith(username: string, password: string, next = "/leads") {
  const { loginAction } = (await import(mod("app/actions/auth.ts"))) as typeof import("../app/actions/auth")
  const fd = new FormData()
  fd.set("username", username)
  fd.set("password", password)
  fd.set("next", next)
  try {
    const state = await loginAction({ error: null }, fd)
    return { state, redirectedTo: null as string | null }
  } catch (err) {
    const to = redirectTarget(err)
    if (!to) throw err
    return { state: null, redirectedTo: to }
  }
}

test("valid login: sets a secure HttpOnly session cookie with an expiry and redirects to the requested page", async () => {
  const r = await loginWith(TEST_ADMIN.username, TEST_ADMIN.password)
  assert.equal(r.redirectedTo, "/leads")
  assert.equal(fakeCookies.sets.length, 1)
  const c = fakeCookies.sets[0]
  assert.equal(c.name, SESSION_COOKIE)
  assert.equal(c.options.httpOnly, true)
  assert.equal(c.options.sameSite, "lax")
  assert.equal(c.options.path, "/")
  assert.equal(c.options.secure, false) // tests run outside production; see the production test below
  const expires = (c.options.expires as Date).getTime()
  assert.ok(Math.abs(expires - (Date.now() + SESSION_TTL_SECONDS * 1000)) < 5000)
  assert.ok(!c.value.includes(TEST_ADMIN.password))
  assert.equal(isValidSession(c.value), true)
  // Username is matched case-insensitively (it is usually an email address).
  fakeCookies.clear()
  assert.equal((await loginWith(TEST_ADMIN.username.toUpperCase(), TEST_ADMIN.password)).redirectedTo, "/leads")
})

test("session cookie is Secure in production", async () => {
  const env = process.env as Record<string, string | undefined>
  const prev = env.NODE_ENV
  env.NODE_ENV = "production"
  try {
    await loginWith(TEST_ADMIN.username, TEST_ADMIN.password)
    assert.equal(fakeCookies.sets[0].options.secure, true)
  } finally {
    env.NODE_ENV = prev
  }
})

test("invalid login: wrong password, wrong username or empty fields set no cookie and give one generic message", async () => {
  for (const [u, p] of [[TEST_ADMIN.username, "wrong password here"], ["someone@else.test", TEST_ADMIN.password], ["", ""], [TEST_ADMIN.username, ""]]) {
    resetLoginRateLimit()
    const r = await loginWith(u, p)
    assert.deepEqual(r.state, { error: "Incorrect username or password.", username: u.trim() })
    if (p) assert.ok(!JSON.stringify(r.state).includes(p), "the password is never sent back")
    assert.equal(fakeCookies.sets.length, 0)
  }
})

test("login after a malicious next= goes to the dashboard, not another site", async () => {
  assert.equal((await loginWith(TEST_ADMIN.username, TEST_ADMIN.password, "https://evil.example/x")).redirectedTo, "/dashboard")
})

test("login is disabled (no default admin) when the server is not configured", async () => {
  clearAuthEnv()
  const errors: unknown[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => { errors.push(a) }
  try {
    for (const [u, p] of [["admin@ritumbhara.com", "password123"], ["admin", "admin"], ["", ""]]) {
      const r = await loginWith(u, p)
      assert.match(r.state?.error || "", /not set up/)
    }
  } finally {
    console.error = orig
  }
  assert.equal(fakeCookies.sets.length, 0)
})

test("repeated wrong passwords lock the login for that address, even for the right password", async () => {
  fakeHeaders.set("x-forwarded-for", "203.0.113.7")
  for (let i = 0; i < 5; i++) await loginWith(TEST_ADMIN.username, "wrong password " + i)
  const blocked = await loginWith(TEST_ADMIN.username, TEST_ADMIN.password)
  assert.match(blocked.state?.error || "", /Too many failed attempts/)
  assert.equal(fakeCookies.sets.length, 0)
  fakeHeaders.set("x-forwarded-for", "198.51.100.9") // another address is not affected
  assert.equal((await loginWith(TEST_ADMIN.username, TEST_ADMIN.password)).redirectedTo, "/leads")
})

test("logout removes the session cookie and redirects to /login; the session no longer authorizes anything", async () => {
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  const { getAdminSession } = (await import(mod("lib/auth/guard.ts"))) as typeof import("../lib/auth/guard")
  assert.ok(await getAdminSession())
  const { logoutAction } = (await import(mod("app/actions/auth.ts"))) as typeof import("../app/actions/auth")
  await assert.rejects(logoutAction(), (err: unknown) => redirectTarget(err) === "/login")
  const cleared = fakeCookies.sets[fakeCookies.sets.length - 1]
  assert.equal(cleared.name, SESSION_COOKIE)
  assert.equal(cleared.value, "")
  assert.equal(cleared.options.maxAge, 0)
  assert.equal(cleared.options.httpOnly, true)
  assert.equal(await getAdminSession(), null)
})

test("login page: a signed-in admin is sent on to the OS instead of seeing the form", async () => {
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  const page = ((await import(mod("app/(auth)/login/page.tsx"))) as { default: (p: { searchParams: Promise<{ next?: string }> }) => Promise<unknown> }).default
  await assert.rejects(page({ searchParams: Promise.resolve({ next: "/leads" }) }), (err: unknown) => redirectTarget(err) === "/leads")
  fakeCookies.clear()
  const el = (await page({ searchParams: Promise.resolve({ next: "//evil.example" }) })) as { props: { next: string } }
  assert.equal(el.props.next, "/dashboard")
})

// ---------- proxy ----------

async function runProxy(url: string, init: { method?: string; headers?: Record<string, string>; cookie?: string } = {}) {
  const { proxy } = (await import(mod("proxy.ts"))) as typeof import("../proxy")
  const headers = new Headers(init.headers || {})
  if (init.cookie !== undefined) headers.set("cookie", SESSION_COOKIE + "=" + init.cookie)
  const res = proxy(new NextRequest(new URL(url, "https://os.example.com"), { method: init.method || "GET", headers }))
  return { status: res.status, location: res.headers.get("location"), passed: res.headers.get("x-middleware-next") === "1" }
}

test("proxy: signed-out page requests go to /login (keeping where they were going)", async () => {
  for (const p of ["/leads", "/dashboard", "/guests", "/guests/abc123", "/reservations?newBooking=true", "/whatsapp", "/team", "/seo", "/units", "/inventory", "/analytics", "/locations", "/operations"]) {
    const r = await runProxy(p)
    assert.equal(r.status, 307, p)
    const loc = new URL(r.location as string)
    assert.equal(loc.pathname, "/login", p)
    assert.equal(loc.searchParams.get("next"), p)
  }
  const home = await runProxy("/")
  assert.equal(new URL(home.location as string).pathname, "/login")
})

test("proxy: signed-out API calls and server-action calls get 401, not data", async () => {
  for (const p of ["/api/guests", "/api/reservations", "/api/tickets", "/api/team", "/api/units", "/api/properties", "/api/dashboard", "/api/analytics", "/api/seo", "/api/revalidate", "/api/fix-units", "/api/test/intellistay", "/api/unknown"]) {
    assert.equal((await runProxy(p)).status, 401, p)
    assert.equal((await runProxy(p, { method: "POST" })).status, 401, p)
  }
  // A replayed server action (POST with the Next-Action header) to any protected page.
  assert.equal((await runProxy("/leads", { method: "POST", headers: { "next-action": "7f00deadbeef", "content-type": "text/plain" } })).status, 401)
  assert.equal((await runProxy("/dashboard", { method: "POST" })).status, 401) // no-JS form post
  assert.equal((await runProxy("/leads", { headers: { "next-action": "7f00deadbeef" } })).status, 401)
})

test("proxy: bypass attempts do not get through", async () => {
  const attempts = [
    "/leads?auth=true", "/leads?admin=1&session=valid", "/leads?next=/login", "/login/../leads", "/stay/../leads",
    "/api/stay/../guests", "//leads", "/leads/", "/stayx", "/stay", "/stay/", "/api/stay", "/api/cronjob", "/loginx", "/login.php/../leads",
  ]
  for (const p of attempts) assert.equal((await runProxy(p)).passed, false, p)
  for (const bad of ["", "admin", "true", "1", "%7B%7D", validSessionToken(Date.now() - 13 * 3600 * 1000)]) {
    assert.equal((await runProxy("/leads", { cookie: bad })).passed, false, "cookie " + bad.slice(0, 10))
    assert.equal((await runProxy("/api/guests", { cookie: bad })).status, 401)
  }
  // Spoofed headers that some apps trust are ignored.
  const spoof = await runProxy("/leads", { headers: { "x-admin": "1", "x-user-role": "ADMIN", authorization: "Bearer admin", "x-middleware-subrequest": "proxy:proxy:proxy" } })
  assert.equal(spoof.passed, false)
})

test("proxy: public guest and machine endpoints stay reachable without a session", async () => {
  // (Cron endpoints are not public: see tests/cron-auth.test.ts.)
  for (const p of ["/login", "/stay/res_123", "/api/stay/res_123/chat", "/api/stay/res_123/tickets", "/api/stay/res_123/membership/join", "/api/whatsapp/webhook"]) {
    const r = await runProxy(p, { method: p.startsWith("/api/") ? "POST" : "GET" })
    assert.equal(r.passed, true, p)
  }
  assert.equal((await runProxy("/stay/res_123", { method: "POST", headers: { "next-action": "abc" } })).passed, true) // guest portal actions
})

test("proxy: a signed-in admin reaches the OS; /login sends them on", async () => {
  const token = validSessionToken()
  for (const p of ["/leads", "/dashboard", "/api/guests"]) assert.equal((await runProxy(p, { cookie: token })).passed, true, p)
  assert.equal((await runProxy("/leads", { method: "POST", headers: { "next-action": "x" }, cookie: token })).passed, true)
  const atLogin = await runProxy("/login?next=%2Fleads", { cookie: token })
  assert.equal(new URL(atLogin.location as string).pathname, "/leads")
  const evil = await runProxy("/login?next=https%3A%2F%2Fevil.example", { cookie: token })
  assert.equal(new URL(evil.location as string).host, "os.example.com")
  assert.equal(new URL(evil.location as string).pathname, "/dashboard")
})

test("public path list is exactly the intended set", () => {
  assert.equal(isPublicPath("/login"), true)
  assert.equal(isPublicPath("/leads"), false)
  assert.equal(isPublicPath("/api/stay/x/chat"), true)
  assert.equal(isPublicPath("/stay"), false)
  assert.equal(isPublicPath("/api/whatsapp/webhook/"), true)
  assert.equal(isPublicPath("/api/whatsapp"), false)
})

// ---------- every admin server action and API route refuses unauthenticated calls ----------

const ADMIN_ACTION_FILES = ["units", "operations", "guests", "locations", "inventory", "whatsapp", "reservations", "team"]
const PUBLIC_ACTIONS = new Set(["membership.ts:joinMembership", "membership.ts:redeemPoints"]) // guest portal

test("every server action file is either admin-guarded or an approved public guest action", () => {
  for (const f of fs.readdirSync(path.join(root, "app/actions"))) {
    const src = fs.readFileSync(path.join(root, "app/actions", f), "utf8")
    const fns = Array.from(src.matchAll(/^export async function (\w+)/gm)).map((m) => m[1])
    for (const fn of fns) {
      const key = f + ":" + fn
      if (PUBLIC_ACTIONS.has(key) || f === "auth.ts") continue
      const body = src.slice(src.indexOf("export async function " + fn))
      const firstLines = body.split("\n").slice(0, 14).join("\n")
      assert.match(firstLines, /await requireAdmin\(\)|await getAdminSession\(\)/, key + " has no admin check at the top")
    }
  }
})

test("signed out: every admin server action throws before touching the database", async () => {
  let called = 0
  for (const name of ADMIN_ACTION_FILES) {
    const m = (await import(mod("app/actions/" + name + ".ts"))) as Record<string, unknown>
    for (const [fn, impl] of Object.entries(m)) {
      if (typeof impl !== "function") continue
      called++
      const fd = new FormData()
      fd.set("name", "x"); fd.set("phone", "+919000000009")
      await assert.rejects((impl as (...a: unknown[]) => Promise<unknown>)(fd, fd, fd), (err: unknown) => err instanceof Error && err.name === "UnauthorizedError", name + "." + fn)
    }
  }
  assert.ok(called >= 24, "checked " + called + " actions")
  assert.deepEqual(prismaTouches, [])
})

test("signed out: every admin API route answers 401 before touching the database", async () => {
  const routes = ["analytics", "dashboard", "fix-units", "guests", "properties", "reservations", "revalidate", "seo", "team", "test/intellistay", "tickets", "units"]
  let called = 0
  for (const r of routes) {
    const m = (await import(mod("app/api/" + r + "/route.ts"))) as Record<string, unknown>
    for (const method of ["GET", "POST"]) {
      const handler = m[method] as ((req: Request) => Promise<Response>) | undefined
      if (!handler) continue
      called++
      const req = new NextRequest("https://os.example.com/api/" + r, { method, ...(method === "POST" ? { body: "{}", headers: { "content-type": "application/json" } } : {}) })
      const res = await handler(req)
      assert.equal(res.status, 401, method + " /api/" + r)
      assert.deepEqual(await res.json(), { success: false, error: "unauthorized" })
    }
  }
  assert.equal(called, 19)
  assert.deepEqual(prismaTouches, [])
})

// ---------- secrets never reach client code ----------

test("no client component imports the auth internals or reads the admin secrets", () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p); continue }
      if (!/\.(tsx?|jsx?)$/.test(e.name)) continue
      const src = fs.readFileSync(p, "utf8")
      if (!/^\s*["']use client["']/.test(src)) continue
      // NEXT_PUBLIC_ variables are public by design; any other env read in a client component would be a leak.
      if (/ADMIN_(USERNAME|PASSWORD|SESSION)|lib\/auth\/(session|guard|rate-limit)|process\.env\.(?!NEXT_PUBLIC_)/.test(src)) offenders.push(path.relative(root, p))
    }
  }
  walk(path.join(root, "app"))
  walk(path.join(root, "components"))
  assert.deepEqual(offenders, [])
})
