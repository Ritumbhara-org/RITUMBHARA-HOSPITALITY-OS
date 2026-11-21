// Housekeeper session + login tests (fake database; no real DB).
import { test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { resetLoginRateLimit } from "../lib/auth/rate-limit"
import { fakeCookies, fakeHeaders, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

type Row = { id: string; name: string; mobile: string; pinHash: string; failedAttempts: number; lockedUntil: Date | null; isActive: boolean; lastLoginAt: Date | null }
const users = new Map<string, Row>()
const fakePrisma = {
  hkUser: {
    findUnique: async ({ where }: { where: { id?: string; mobile?: string } }) =>
      Array.from(users.values()).find((u) => (where.id ? u.id === where.id : u.mobile === where.mobile)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const u = users.get(where.id) as Row
      Object.assign(u, data)
      return u
    },
  },
}
mock.module("next/headers", nextHeadersMock)
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: fakePrisma }, defaultExport: fakePrisma })

// Loaded after the mocks above are registered (static imports would run first).
let hashSecret: typeof import("../lib/hk/secret").hashSecret
let session: typeof import("../lib/hk/session")
let actions: typeof import("../app/actions/hk-auth")
before(async () => {
  hashSecret = (await import(mod("lib/hk/secret.ts"))).hashSecret
  session = await import(mod("lib/hk/session.ts"))
  actions = await import(mod("app/actions/hk-auth.ts"))
})

const MOBILE = "+919876543210"
function addUser(over: Partial<Row> = {}) {
  const u: Row = { id: "u1", name: "Asha", mobile: MOBILE, pinHash: hashSecret("4821"), failedAttempts: 0, lockedUntil: null, isActive: true, lastLoginAt: null, ...over }
  users.set(u.id, u)
  return u
}
function redirectTarget(err: unknown): string {
  const m = String((err as { digest?: string }).digest || "").match(/^NEXT_REDIRECT;[^;]*;([^;]+);/)
  return m ? m[1] : ""
}
async function login(mobile: string, pin: string) {
  const fd = new FormData()
  fd.set("mobile", mobile)
  fd.set("pin", pin)
  try {
    return { state: await actions.hkLoginAction({ error: null }, fd), redirect: "" }
  } catch (e) {
    return { state: null, redirect: redirectTarget(e) }
  }
}

beforeEach(async () => {
  await setAuthEnv()
  fakeCookies.clear()
  for (const k of Array.from(fakeHeaders.keys())) fakeHeaders.delete(k)
  resetLoginRateLimit()
  users.clear()
})

test("token round trip, tampering and expiry", () => {
  const u = addUser()
  const made = session.createHkToken(u)
  assert.ok(made)
  assert.equal(session.verifyHkToken(made.token)?.uid, "u1")
  assert.equal(session.verifyHkToken(made.token + "x"), null)
  assert.equal(session.verifyHkToken("a.b"), null)
  assert.equal(session.verifyHkToken(made.token, Date.now() + 13 * 3600 * 1000), null)
})

test("an admin cookie is not an HK cookie and the reverse", async () => {
  const u = addUser()
  assert.equal(session.verifyHkToken(validSessionToken()), null)
  const made = session.createHkToken(u)
  assert.ok(made)
  const { isValidSession } = await import(mod("lib/auth/session.ts"))
  assert.equal(isValidSession(made.token), false)
})

test("login: right PIN sets the cookie and goes to /hk", async () => {
  addUser()
  const r = await login("98765 43210", "4821")
  assert.equal(r.redirect, "/hk")
  assert.ok(fakeCookies.get(session.HK_COOKIE))
  assert.equal((await session.getHkSession())?.id, "u1")
})

test("login: wrong PIN, unknown number, bad format and inactive users get the same error", async () => {
  addUser()
  addUser({ id: "u2", mobile: "+919812345678", isActive: false })
  for (const [m, p] of [[MOBILE, "0000"], ["9000000000", "4821"], [MOBILE, "12"], ["+919812345678", "4821"]]) {
    const r = await login(m, p)
    assert.equal(r.state?.error, "Incorrect mobile number or PIN.", m + p)
  }
  assert.equal(fakeCookies.get(session.HK_COOKIE), undefined)
})

test("login: five wrong PINs lock the account even for the right PIN", async () => {
  addUser()
  for (let i = 0; i < 5; i++) await login(MOBILE, "0000")
  assert.ok(users.get("u1")?.lockedUntil)
  resetLoginRateLimit() // the per-IP limiter would also have tripped; test the per-account lock on its own
  const r = await login(MOBILE, "4821")
  assert.match(r.state?.error ?? "", /locked/)
  assert.equal(fakeCookies.get(session.HK_COOKIE), undefined)
})

test("session dies when the user is deactivated, the mobile changes or the PIN is reset", async () => {
  const u = addUser()
  await login(MOBILE, "4821")
  assert.ok(await session.getHkSession())
  u.pinHash = hashSecret("9999")
  assert.equal(await session.getHkSession(), null)
  u.pinHash = users.get("u1")!.pinHash
  await login(MOBILE, "9999")
  assert.ok(await session.getHkSession())
  u.isActive = false
  assert.equal(await session.getHkSession(), null)
  await assert.rejects(session.assertHk(), (e: unknown) => e instanceof session.HkAuthError)
})

test("logout clears the cookie", async () => {
  addUser()
  await login(MOBILE, "4821")
  await assert.rejects(actions.hkLogoutAction(), (e: unknown) => redirectTarget(e) === "/hk/login")
  assert.equal(await session.getHkSession(), null)
})
