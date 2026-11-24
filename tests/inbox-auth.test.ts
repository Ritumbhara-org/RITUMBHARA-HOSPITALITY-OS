// Admin auth + unified Inbox compatibility.
//  - /api/inbox/inbound-email is machine-only: no admin session needed, but its own INBOX_WEBHOOK_SECRET is
//    required, and it refuses everything when that secret is not configured.
//  - The Inbox page and every Inbox server action require the admin session (and still work when signed in).
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { NextRequest } from "next/server"
import { SESSION_COOKIE } from "../lib/auth/session"
import { isPublicPath, isSelfAuthenticatedMachinePath } from "../lib/auth/policy"
import { fakeCookies, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

const INBOX_SECRET = "inbox-test-secret-5c1e9a7b3d"
const work: string[] = []
const rec = (name: string, value: unknown) => async () => { work.push(name); return value }

const prismaTrap: unknown = new Proxy({}, {
  get(_t, model) {
    if (model === "then") return undefined
    work.push("prisma." + String(model))
    throw new Error("database touched: " + String(model))
  },
})
mock.module("next/headers", nextHeadersMock)
mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } })
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: prismaTrap }, defaultExport: prismaTrap })
mock.module(mod("lib/inbox/ingest.ts"), {
  namedExports: {
    ingestInboundEmailSafely: rec("ingestInboundEmailSafely", { stored: true }),
    removeIgnoredMessage: rec("removeIgnoredMessage", false),
  },
})
mock.module(mod("lib/inbox/service.ts"), {
  namedExports: {
    listConversations: rec("listConversations", []),
    getThread: rec("getThread", null),
    sendReply: rec("sendReply", { success: true }),
    assignConversation: rec("assignConversation", { success: true }),
    setConversationStatus: rec("setConversationStatus", { success: true }),
    markConversationRead: rec("markConversationRead", { success: true }),
    linkReservation: rec("linkReservation", { success: true }),
    searchReservations: rec("searchReservations", []),
    draftReply: rec("draftReply", { success: true, data: { draft: "" } }),
  },
})

type Handler = (req: Request) => Promise<Response>
async function webhook(): Promise<Handler> {
  return ((await import(mod("app/api/inbox/inbound-email/route.ts"))) as { POST: Handler }).POST
}
function emailRequest(headers: Record<string, string> = {}, query = "") {
  return new NextRequest("https://os.example.com/api/inbox/inbound-email" + query, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ From: "guest@example.com", Subject: "Question about my stay", TextBody: "Hello, can we check in early?" }),
  })
}

beforeEach(async () => {
  process.env.INBOX_WEBHOOK_SECRET = INBOX_SECRET
  await setAuthEnv()
  fakeCookies.clear()
  work.length = 0
})

// ---------- the inbox email webhook (machine-only, its own secret) ----------

test("proxy: the inbox webhook needs no admin session (the route checks its own secret); lookalikes stay protected", async () => {
  const { proxy } = (await import(mod("proxy.ts"))) as typeof import("../proxy")
  const run = (p: string, headers: Record<string, string> = {}) =>
    proxy(new NextRequest(new URL(p, "https://os.example.com"), { method: "POST", headers }))
  const variants: Record<string, string>[] = [{}, { "x-inbox-secret": INBOX_SECRET }, { "x-inbox-secret": "wrong" }]
  for (const headers of variants) {
    const r = run("/api/inbox/inbound-email", headers)
    assert.equal(r.headers.get("x-middleware-next"), "1", JSON.stringify(headers))
  }
  assert.equal(isSelfAuthenticatedMachinePath("/api/inbox/inbound-email/"), true)
  assert.equal(isPublicPath("/api/inbox/inbound-email"), false) // not public: the route requires its secret
  for (const p of ["/api/inbox", "/api/inbox/inbound-emailx", "/api/inbox/inbound-email/extra", "/api/inbox/other", "/inbox"]) {
    assert.equal(isSelfAuthenticatedMachinePath(p), false, p)
    const r = run(p, { "x-inbox-secret": INBOX_SECRET })
    assert.notEqual(r.headers.get("x-middleware-next"), "1", p + " must still need the admin session")
  }
})

test("inbox webhook: refuses everything when INBOX_WEBHOOK_SECRET is not configured", async () => {
  const POST = await webhook()
  for (const missing of [undefined, ""]) {
    if (missing === undefined) delete process.env.INBOX_WEBHOOK_SECRET
    else process.env.INBOX_WEBHOOK_SECRET = missing
    const attempts: Record<string, string>[] = [{}, { "x-inbox-secret": "" }, { "x-inbox-secret": "undefined" }, { "x-inbox-secret": INBOX_SECRET }]
    for (const h of attempts) {
      const res = await POST(emailRequest(h))
      assert.equal(res.status, 503, JSON.stringify(h))
    }
  }
  assert.deepEqual(work, [])
})

test("inbox webhook: missing or wrong secret, or an admin session alone, is refused with no work done", async () => {
  const POST = await webhook()
  const attempts: Record<string, string>[] = [
    {},
    { "x-inbox-secret": "wrong-secret" },
    { "x-inbox-secret": INBOX_SECRET + "x" },
    { authorization: "Bearer " + INBOX_SECRET },
    { cookie: SESSION_COOKIE + "=" + validSessionToken() },
  ]
  for (const h of attempts) {
    const res = await POST(emailRequest(h))
    assert.equal(res.status, 401, JSON.stringify(h))
  }
  assert.deepEqual(work, [])
})

test("inbox webhook: with its secret it works exactly as before (no admin session involved)", async () => {
  const POST = await webhook()
  const res = await POST(emailRequest({ "x-inbox-secret": INBOX_SECRET }))
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok?: boolean }
  assert.equal(body.ok, true)
  assert.ok(work.includes("ingestInboundEmailSafely") || work.includes("removeIgnoredMessage"), JSON.stringify(work))
  // The existing ?token= form is also still accepted (unchanged Inbox behaviour).
  work.length = 0
  const viaToken = await POST(emailRequest({}, "?token=" + INBOX_SECRET))
  assert.equal(viaToken.status, 200)
})

// ---------- the Inbox page and its server actions (admin only) ----------

test("inbox page: signed out it redirects to /login and reads nothing", async () => {
  const page = ((await import(mod("app/(dashboard)/inbox/page.tsx"))) as { default: (p: { searchParams: Promise<Record<string, string>> }) => Promise<unknown> }).default
  await assert.rejects(page({ searchParams: Promise.resolve({}) }), (err: unknown) => {
    assert.match(String((err as { digest?: string }).digest || ""), /^NEXT_REDIRECT;[^;]*;\/login\?next=%2Finbox;/)
    return true
  })
  assert.deepEqual(work, [])
})

const INBOX_ACTION_CALLS: [string, unknown[]][] = [
  ["getInboxConversations", ["ALL"]],
  ["getInboxThread", ["conv-1"]],
  ["sendInboxReply", ["conv-1", "Hello"]],
  ["assignInboxConversation", ["conv-1", null]],
  ["setInboxConversationStatus", ["conv-1", "CLOSED"]],
  ["markInboxConversationRead", ["conv-1"]],
  ["linkInboxReservation", ["conv-1", null]],
  ["searchInboxReservations", ["smith"]],
  ["draftInboxReply", ["conv-1"]],
]

test("all 9 inbox actions refuse signed-out calls before doing anything", async () => {
  const actions = (await import(mod("app/actions/inbox.ts"))) as Record<string, (...a: unknown[]) => Promise<unknown>>
  const exported = Object.keys(actions).filter((k) => typeof actions[k] === "function").sort()
  assert.deepEqual(exported, INBOX_ACTION_CALLS.map((c) => c[0]).sort())
  for (const [name, args] of INBOX_ACTION_CALLS) {
    await assert.rejects(actions[name](...args), (err: unknown) => err instanceof Error && err.name === "UnauthorizedError", name)
  }
  assert.deepEqual(work, [])
})

test("signed in, the inbox actions still reach the inbox service", async () => {
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  const actions = (await import(mod("app/actions/inbox.ts"))) as Record<string, (...a: unknown[]) => Promise<unknown>>
  for (const [name, args] of INBOX_ACTION_CALLS) {
    if (name === "sendInboxReply") continue // also looks up the legacy auth-token team member in the database
    work.length = 0
    await actions[name](...args)
    assert.equal(work.length, 1, name + " -> " + JSON.stringify(work))
  }
})
