// Machine-to-machine (cron) endpoint protection. Proves that /api/cron/* can only be invoked with the cron
// secret, that a missing CRON_SECRET keeps them closed, and that no work runs on a refused request.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as realNextServer from "next/server"
import { NextRequest } from "next/server"
import { checkCronAuth, MIN_CRON_SECRET_LENGTH } from "../lib/auth/cron"
import { isCronPath, isPublicPath } from "../lib/auth/policy"
import { SESSION_COOKIE } from "../lib/auth/session"
import { setAuthEnv, validSessionToken } from "./helpers/auth-env"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

const SECRET = "cron-test-secret-7f3a9c2e5b1d8e4f"

// Every piece of real work the cron routes can do is replaced by a recorder.
const work: string[] = []
const record = (name: string, value: unknown = { success: true }) => async () => { work.push(name); return value }
const prismaRecorder = {
  ticket: { findMany: async () => { work.push("prisma.ticket.findMany"); return [] } },
  whatsAppMessage: { deleteMany: async () => { work.push("prisma.whatsAppMessage.deleteMany"); return { count: 0 } } },
}
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: prismaRecorder }, defaultExport: prismaRecorder })
mock.module(mod("lib/events/cron.ts"), { namedExports: { processDailyAutomations: record("processDailyAutomations", { ok: 1 }), checkSlaBreaches: record("checkSlaBreaches") } })
mock.module(mod("lib/intellistay/sync.ts"), { namedExports: { syncBookings: record("syncBookings") } })
mock.module(mod("lib/reservations/auto-status.ts"), { namedExports: { processAutoCheckinCheckout: record("processAutoCheckinCheckout") } })
mock.module(mod("lib/operations/reminders.ts"), { namedExports: { processTeamReminders: record("processTeamReminders") } })
mock.module(mod("lib/operations/round-robin.ts"), { namedExports: { assignTicketRoundRobin: record("assignTicketRoundRobin") } })
// `after()` only works inside a real request; here it records that background work was scheduled.
mock.module("next/server", { namedExports: { ...realNextServer, after: (fn: () => unknown) => { work.push("after:scheduled"); void fn } } })

const CRON_ROUTES = ["automations", "cleanup", "escalate-tickets", "sync"]

type Handler = (req: Request) => Promise<Response>
async function handler(route: string): Promise<Handler> {
  return ((await import(mod("app/api/cron/" + route + "/route.ts"))) as { GET: Handler }).GET
}
function cronRequest(route: string, headers: Record<string, string> = {}, query = ""): NextRequest {
  return new NextRequest("https://os.example.com/api/cron/" + route + query, { headers })
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  work.length = 0
})

// ---------- the rule itself ----------

test("checkCronAuth: only the exact bearer secret is accepted", () => {
  assert.deepEqual(checkCronAuth("Bearer " + SECRET), { ok: true })
  for (const h of [null, "", "Bearer", "Bearer ", "bearer " + SECRET, "Bearer  " + SECRET, "Bearer " + SECRET + " ", "Bearer " + SECRET + "x",
    "Bearer " + SECRET.slice(0, -1), "Basic " + Buffer.from("cron:" + SECRET).toString("base64"), SECRET, "Bearer undefined", "Token " + SECRET]) {
    assert.deepEqual(checkCronAuth(h), { ok: false, status: 401, error: "unauthorized" }, String(h))
  }
})

test("checkCronAuth: a missing, blank or too-short CRON_SECRET fails closed for every request", () => {
  for (const secret of [undefined, "", "   ", "short", "x".repeat(MIN_CRON_SECRET_LENGTH - 1)]) {
    const env = { CRON_SECRET: secret }
    // Including the classic mistake of comparing against `Bearer ${undefined}` or an empty secret.
    for (const h of [null, "", "Bearer ", "Bearer undefined", "Bearer " + String(secret), "Bearer " + SECRET]) {
      assert.deepEqual(checkCronAuth(h, env), { ok: false, status: 503, error: "cron_not_configured" }, String(secret) + " / " + h)
    }
  }
})

// ---------- every cron route ----------

test("every cron route refuses requests without the right secret, and does no work", async () => {
  const bad: { headers?: Record<string, string>; query?: string }[] = [
    {},
    { headers: { authorization: "Bearer wrong-secret-value-123456" } },
    { headers: { authorization: "Bearer " } },
    { headers: { authorization: SECRET } },
    { query: "?secret=" + SECRET }, // secrets in the URL are never accepted
    { query: "?CRON_SECRET=" + SECRET + "&auth=true" },
    { headers: { "x-cron-secret": SECRET, "x-vercel-cron": "1", "user-agent": "vercel-cron/1.0" } }, // spoofable headers
    { headers: { cookie: SESSION_COOKIE + "=anything" } },
  ]
  for (const route of CRON_ROUTES) {
    const GET = await handler(route)
    for (const b of bad) {
      const res = await GET(cronRequest(route, b.headers, b.query))
      assert.equal(res.status, 401, route + " " + JSON.stringify(b))
      assert.deepEqual(await res.json(), { success: false, error: "unauthorized" })
    }
  }
  assert.deepEqual(work, [])
})

test("every cron route refuses everything when CRON_SECRET is not configured (no accidental public endpoint)", async () => {
  for (const missing of [undefined, "", "too-short"]) {
    if (missing === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = missing
    const errors: unknown[] = []
    const orig = console.error
    console.error = (...a: unknown[]) => { errors.push(a) }
    try {
      for (const route of CRON_ROUTES) {
        const GET = await handler(route)
        const attempts: Record<string, string>[] = [{}, { authorization: "Bearer undefined" }, { authorization: "Bearer " }, { authorization: "Bearer " + SECRET }]
        for (const h of attempts) {
          const res = await GET(cronRequest(route, h))
          assert.equal(res.status, 503, route + " CRON_SECRET=" + String(missing))
          assert.deepEqual(await res.json(), { success: false, error: "cron_not_configured" })
        }
      }
    } finally {
      console.error = orig
    }
    assert.ok(errors.length > 0, "the misconfiguration is logged on the server")
    assert.doesNotMatch(JSON.stringify(errors), new RegExp(SECRET))
  }
  assert.deepEqual(work, [])
})

test("an admin browser session alone cannot run cron jobs", async () => {
  await setAuthEnv()
  const cookie = SESSION_COOKIE + "=" + validSessionToken()
  for (const route of CRON_ROUTES) {
    const res = await (await handler(route))(cronRequest(route, { cookie }))
    assert.equal(res.status, 401, route)
  }
  assert.deepEqual(work, [])
})

test("with the correct secret each cron route runs its job as before", async () => {
  const auth = { authorization: "Bearer " + SECRET }
  const expected: Record<string, string[]> = {
    automations: ["processDailyAutomations", "checkSlaBreaches"],
    cleanup: ["prisma.whatsAppMessage.deleteMany"],
    "escalate-tickets": ["prisma.ticket.findMany"],
    sync: ["after:scheduled"],
  }
  for (const route of CRON_ROUTES) {
    work.length = 0
    const res = await (await handler(route))(cronRequest(route, auth))
    assert.equal(res.status, 200, route)
    assert.deepEqual(work, expected[route], route)
  }
})

// ---------- proxy (first gate) ----------

async function runProxy(url: string, headers: Record<string, string> = {}) {
  const { proxy } = (await import(mod("proxy.ts"))) as typeof import("../proxy")
  const res = proxy(new NextRequest(new URL(url, "https://os.example.com"), { headers }))
  return { status: res.status, passed: res.headers.get("x-middleware-next") === "1" }
}

test("proxy: cron paths need the secret, are not public, and an admin session does not open them", async () => {
  await setAuthEnv()
  const session = { cookie: SESSION_COOKIE + "=" + validSessionToken() }
  for (const p of ["/api/cron/sync", "/api/cron/automations", "/api/cron/escalate-tickets", "/api/cron/cleanup", "/api/cron/new-future-job", "/api/cron", "/api/cron/sync/", "/api/cron//sync"]) {
    assert.equal(isPublicPath(p), false, p)
    assert.equal(isCronPath(p), true, p)
    assert.equal((await runProxy(p)).status, 401, p)
    assert.equal((await runProxy(p, session)).status, 401, p + " with admin session")
    assert.equal((await runProxy(p + "?secret=" + SECRET)).status, 401, p + " with secret in URL")
    assert.equal((await runProxy(p, { authorization: "Bearer " + SECRET })).passed, true, p + " with secret")
  }
  delete process.env.CRON_SECRET
  assert.equal((await runProxy("/api/cron/sync", { authorization: "Bearer undefined" })).status, 503)
  assert.equal((await runProxy("/api/cron/sync", { authorization: "Bearer " })).status, 503)
  assert.equal(isCronPath("/api/cronjob"), false)
})

// ---------- inventory: no API route is unintentionally public ----------

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? routeFiles(p) : e.name === "route.ts" ? [path.relative(root, p).replace(/\\/g, "/")] : []
  })
}

// Routes that are public on purpose, and why. Anything not listed must be admin-only or cron-only.
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  "app/api/stay/[id]/chat/route.ts": "guest portal",
  "app/api/stay/[id]/membership/join/route.ts": "guest portal",
  "app/api/stay/[id]/tickets/route.ts": "guest portal",
  "app/api/whatsapp/webhook/route.ts": "Twilio inbound webhook (out of scope of this change)",
  "app/api/whatsapp/meta-audit/route.ts": "Read-only Meta audit: 404 unless VERCEL_ENV=preview and ?key matches META_AUDIT_KEY (tests/meta-audit.test.ts)",
  "app/api/whatsapp/meta-webhook/route.ts": "Meta inbound webhook: verifies X-Hub-Signature-256 itself and fails closed without META_APP_SECRET (tests/meta-whatsapp-route.test.ts)",
  "app/api/instagram/webhook/route.ts": "Instagram DM webhook: verifies X-Hub-Signature-256 itself and fails closed without an app secret and verify token (tests/instagram-inbox.test.ts)",
  "app/api/sign/[token]/otp/route.ts": "Long Stay e-sign: guest's WhatsApp OTP for the one agreement behind the token",
  "app/api/sign/[token]/verify/route.ts": "Long Stay e-sign: checks that OTP (5 wrong codes lock the link)",
  "app/api/sign/[token]/sign/route.ts": "Long Stay e-sign: records the guest's signature",
  "app/api/sign/[token]/pdf/route.ts": "Long Stay e-sign: the guest's own signed PDF",
}

// Machine-only routes that check their own secret first (no admin session). See tests/inbox-auth.test.ts.
const SELF_AUTHENTICATED_MACHINE: Record<string, RegExp> = {
  "app/api/inbox/inbound-email/route.ts": /^\s*if \(!process\.env\.INBOX_WEBHOOK_SECRET\) \{[\s\S]{0,160}status: 503[\s\S]{0,40}\}\s*\r?\n\s*if \(!authorized\(request\)\) \{[\s\S]{0,120}status: 401/,
}

test("every API route is admin-only, cron-only, machine-only with its own secret, or on the intentional public list", () => {
  const unclassified: string[] = []
  for (const f of routeFiles(path.join(root, "app/api"))) {
    const src = fs.readFileSync(path.join(root, f), "utf8")
    const handlers = Array.from(src.matchAll(/^export async function (GET|POST|PUT|PATCH|DELETE)\(([^)]*)\)[^{]*\{\r?\n([\s\S]{0,400})/gm))
    if (f.startsWith("app/api/cron/")) {
      assert.ok(handlers.length > 0, f)
      for (const h of handlers) assert.match(h[3], /^\s*\/\/[^\r\n]*\r?\n(\s*\/\/[^\r\n]*\r?\n)*\s*const denied = cronGuard\(\w+\);\s*\r?\n\s*if \(denied\) return denied;/, f + " " + h[1] + " must call cronGuard first")
      continue
    }
    if (INTENTIONALLY_PUBLIC[f]) continue
    if (SELF_AUTHENTICATED_MACHINE[f]) {
      assert.ok(handlers.length > 0, f)
      for (const h of handlers) assert.match(h[3], SELF_AUTHENTICATED_MACHINE[f], f + " " + h[1] + " must check its secret first")
      continue
    }
    if (handlers.length && handlers.every((h) => /^\s*const denied = await adminApiGuard\(\)\s*\r?\n\s*if \(denied\) return denied/.test(h[3]))) continue
    unclassified.push(f)
  }
  assert.deepEqual(unclassified, [])
})

test("no client code references the cron secret", () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p); continue }
      if (!/\.(tsx?|jsx?)$/.test(e.name)) continue
      const src = fs.readFileSync(p, "utf8")
      if (/^\s*["']use client["']/.test(src) && /CRON_SECRET|lib\/auth\/cron/.test(src)) offenders.push(path.relative(root, p))
    }
  }
  walk(path.join(root, "app"))
  walk(path.join(root, "components"))
  assert.deepEqual(offenders, [])
})
