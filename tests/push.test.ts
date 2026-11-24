// Phone alerts (web push): the sender, the endpoint safety check, notifyAdmin -> push, and the subscribe API.
// web-push and the database are fakes, so nothing here sends a real push or needs Postgres.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { SESSION_COOKIE } from "../lib/auth/session"
import { fakeCookies, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

// ---------- fakes ----------

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; userAgent: string | null }
type Sent = { subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; payload: string; options: Record<string, unknown> }

let subs: Sub[] = []
let notifications: { id: string; groupKey: string | null; readAt: Date | null; title: string; count: number; severity: string }[] = []
let sent: Sent[] = []
let failWith: Record<string, number> = {} // endpoint -> HTTP status the push service answers with
let dbDown = false

const GOOD = "https://fcm.googleapis.com/fcm/send/abc123"
const GOOD2 = "https://updates.push.services.mozilla.com/wpush/v2/xyz"

const fakePrisma = {
  pushSubscription: {
    findMany: async () => { if (dbDown) throw new Error("db down"); return [...subs] },
    deleteMany: async ({ where }: { where: { id?: { in: string[] }; endpoint?: string } }) => {
      const before = subs.length
      subs = subs.filter((s) => !(where.id?.in.includes(s.id) || (where.endpoint !== undefined && s.endpoint === where.endpoint)))
      return { count: before - subs.length }
    },
    upsert: async ({ where, create, update }: { where: { endpoint: string }; create: Omit<Sub, "id">; update: Partial<Sub> }) => {
      const existing = subs.find((s) => s.endpoint === where.endpoint)
      if (existing) Object.assign(existing, update)
      else subs.push({ id: "s" + (subs.length + 1), ...create })
    },
  },
  adminNotification: {
    findFirst: async ({ where }: { where: { groupKey: string } }) => notifications.find((n) => n.groupKey === where.groupKey && n.readAt === null) ?? null,
    create: async ({ data }: { data: { title: string; groupKey: string | null; severity: string } }) => {
      notifications.push({ id: "n" + (notifications.length + 1), readAt: null, count: 1, ...data })
    },
    update: async ({ where, data }: { where: { id: string }; data: { title: string } }) => {
      const n = notifications.find((x) => x.id === where.id)!
      n.title = data.title
      n.count += 1
    },
  },
}

mock.module("next/headers", nextHeadersMock)
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: fakePrisma }, defaultExport: fakePrisma })
mock.module("web-push", {
  defaultExport: {
    sendNotification: async (subscription: Sent["subscription"], payload: string, options: Record<string, unknown>) => {
      const status = failWith[subscription.endpoint]
      if (status) throw Object.assign(new Error("push failed"), { statusCode: status })
      sent.push({ subscription, payload, options })
      return { statusCode: 201 }
    },
  },
})

beforeEach(async () => {
  subs = []
  notifications = []
  sent = []
  failWith = {}
  dbDown = false
  process.env.VAPID_PUBLIC_KEY = "BPublicKeyForTests"
  process.env.VAPID_PRIVATE_KEY = "privateKeyForTests"
  delete process.env.VAPID_SUBJECT
  await setAuthEnv()
  fakeCookies.clear()
})

const addSub = (endpoint = GOOD, id = "s" + (subs.length + 1)) => subs.push({ id, endpoint, p256dh: "p256-" + id, auth: "auth-" + id, userAgent: null })
const push = () => import(mod("lib/notifications/push.ts"))
const silently = async (fn: () => Promise<void>) => {
  const orig = console.error
  console.error = () => {}
  try { await fn() } finally { console.error = orig }
}

// ---------- config and endpoint safety ----------

test("pushConfig needs both keys; the subject defaults to the support address", async () => {
  const { pushConfig } = await push()
  assert.equal(pushConfig({}), null)
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: "a" }), null)
  assert.equal(pushConfig({ VAPID_PRIVATE_KEY: "b" }), null)
  assert.deepEqual(pushConfig({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" }), { publicKey: "a", privateKey: "b", subject: "mailto:studios.jaipur@gmail.com" })
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "mailto:x@y.z" })?.subject, "mailto:x@y.z")
})

test("only real browser push services are accepted as a phone's address", async () => {
  const { isAllowedPushEndpoint } = await push()
  for (const ok of [GOOD, GOOD2, "https://web.push.apple.com/QAbc", "https://wns2-pn1p.notify.windows.com/w/?token=x"]) {
    assert.equal(isAllowedPushEndpoint(ok), true, ok)
  }
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc", "https://evil.com/fcm.googleapis.com", "https://fcm.googleapis.com.evil.com/x",
    "https://169.254.169.254/latest", "https://localhost/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x",
    "javascript:alert(1)", "not a url", "", null, 42, "https://fcm.googleapis.com/" + "a".repeat(1100),
  ]) {
    assert.equal(isAllowedPushEndpoint(bad), false, String(bad))
  }
})

// ---------- sender ----------

test("without VAPID keys nothing is sent and the database is not read", async () => {
  delete process.env.VAPID_PRIVATE_KEY
  addSub()
  let read = false
  const orig = fakePrisma.pushSubscription.findMany
  fakePrisma.pushSubscription.findMany = async () => { read = true; return orig() }
  try {
    const { sendPushToAdmin } = await push()
    await sendPushToAdmin({ title: "Hi", severity: "INFO" })
  } finally {
    fakePrisma.pushSubscription.findMany = orig
  }
  assert.equal(sent.length, 0)
  assert.equal(read, false)
})

test("sends one encrypted message per subscribed phone with the title, text, link and tag", async () => {
  addSub(GOOD, "s1")
  addSub(GOOD2, "s2")
  const { sendPushToAdmin } = await push()
  await sendPushToAdmin({ title: "New WhatsApp message", body: "Is early check-in possible?", href: "/inbox", severity: "ACTION", groupKey: "wa:919000000001" })
  assert.equal(sent.length, 2)
  assert.deepEqual(sent.map((s) => s.subscription.endpoint).sort(), [GOOD, GOOD2].sort())
  assert.deepEqual(sent[0].subscription.keys, { p256dh: "p256-s1", auth: "auth-s1" })
  assert.deepEqual(JSON.parse(sent[0].payload), { title: "New WhatsApp message", body: "Is early check-in possible?", href: "/inbox", severity: "ACTION", tag: "wa:919000000001" })
  assert.equal(sent[0].options.urgency, "normal")
  assert.deepEqual(sent[0].options.vapidDetails, { subject: "mailto:studios.jaipur@gmail.com", publicKey: "BPublicKeyForTests", privateKey: "privateKeyForTests" })
})

test("critical alerts are sent with high urgency", async () => {
  addSub()
  const { sendPushToAdmin } = await push()
  await sendPushToAdmin({ title: "SLA missed", severity: "CRITICAL" })
  assert.equal(sent[0].options.urgency, "high")
})

test("a phone that is gone (404/410) is forgotten; other failures keep it; nothing throws", async () => {
  addSub(GOOD, "s1")
  addSub(GOOD2, "s2")
  addSub("https://fcm.googleapis.com/fcm/send/third", "s3")
  failWith[GOOD] = 410
  failWith["https://fcm.googleapis.com/fcm/send/third"] = 500
  const { sendPushToAdmin } = await push()
  await silently(() => sendPushToAdmin({ title: "x", severity: "INFO" }))
  assert.deepEqual(subs.map((s) => s.id).sort(), ["s2", "s3"])
  assert.equal(sent.length, 1) // only the healthy phone received it
})

test("a database error never throws out of sendPushToAdmin", async () => {
  addSub()
  dbDown = true
  const { sendPushToAdmin } = await push()
  await silently(() => assert.doesNotReject(() => sendPushToAdmin({ title: "x", severity: "INFO" })))
})

// ---------- notifyAdmin -> push ----------

test("every stored notification is also pushed; a repeat reuses the tag so the phone replaces the alert", async () => {
  addSub()
  const { notifyAdmin } = await import(mod("lib/notifications/service.ts"))
  await notifyAdmin({ type: "WHATSAPP_MESSAGE", severity: "ACTION", title: "First", groupKey: "wa:1", href: "/inbox" })
  await notifyAdmin({ type: "WHATSAPP_MESSAGE", severity: "ACTION", title: "Second", groupKey: "wa:1", href: "/inbox" })
  assert.equal(notifications.length, 1) // collapsed in the bell
  assert.equal(sent.length, 2) // but the phone is told both times
  assert.deepEqual(sent.map((s) => JSON.parse(s.payload).title), ["First", "Second"])
  assert.equal(JSON.parse(sent[1].payload).tag, "wa:1")
})

test("if the push fails, the notification is still stored", async () => {
  addSub()
  failWith[GOOD] = 500
  const { notifyAdmin } = await import(mod("lib/notifications/service.ts"))
  await silently(() => notifyAdmin({ type: "T", severity: "INFO", title: "Stored anyway" }))
  assert.equal(notifications.length, 1)
})

// ---------- API ----------

type Route = { GET: () => Promise<Response>; POST: (r: Request) => Promise<Response>; DELETE: (r: Request) => Promise<Response> }
const route = async () => (await import(mod("app/api/notifications/push/route.ts"))) as Route
const req = (method: string, body: unknown) =>
  new Request("https://os.example.com/api/notifications/push", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) })
const signIn = () => fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
const subscription = (endpoint = GOOD) => ({ endpoint, keys: { p256dh: "BKey", auth: "authKey" } })

test("API: signed-out requests get 401 and nothing is saved or removed", async () => {
  addSub()
  const { GET, POST, DELETE } = await route()
  assert.equal((await GET()).status, 401)
  assert.equal((await POST(req("POST", { subscription: subscription(GOOD2) }))).status, 401)
  assert.equal((await DELETE(req("DELETE", { endpoint: GOOD }))).status, 401)
  assert.equal(subs.length, 1)
})

test("API: GET says whether alerts are set up and gives the public key", async () => {
  signIn()
  const { GET } = await route()
  assert.deepEqual(await (await GET()).json(), { success: true, configured: true, publicKey: "BPublicKeyForTests" })
  delete process.env.VAPID_PUBLIC_KEY
  assert.deepEqual(await (await GET()).json(), { success: true, configured: false, publicKey: null })
})

test("API: POST saves a phone once (no duplicates) and rejects bad addresses and keys", async () => {
  signIn()
  const { POST } = await route()
  assert.equal((await POST(req("POST", "not json"))).status, 400)
  assert.equal((await POST(req("POST", { subscription: subscription("https://evil.com/x") }))).status, 400)
  assert.equal((await POST(req("POST", { subscription: subscription("http://fcm.googleapis.com/x") }))).status, 400)
  assert.equal((await POST(req("POST", { subscription: { endpoint: GOOD, keys: { p256dh: "", auth: "a" } } }))).status, 400)
  assert.equal((await POST(req("POST", { subscription: { endpoint: GOOD } }))).status, 400)
  assert.equal(subs.length, 0)

  assert.equal((await POST(req("POST", { subscription: subscription(), userAgent: "TestPhone/1.0" }))).status, 200)
  assert.equal((await POST(req("POST", { subscription: subscription(), userAgent: "TestPhone/1.0" }))).status, 200)
  assert.equal(subs.length, 1)
  assert.equal(subs[0].userAgent, "TestPhone/1.0")
})

test("API: POST refuses with 503 when the server has no VAPID keys", async () => {
  signIn()
  delete process.env.VAPID_PRIVATE_KEY
  const { POST } = await route()
  assert.equal((await POST(req("POST", { subscription: subscription() }))).status, 503)
  assert.equal(subs.length, 0)
})

test("API: turning alerts on with test:true sends a first alert to the phone", async () => {
  signIn()
  const { POST } = await route()
  await POST(req("POST", { subscription: subscription(), test: true }))
  assert.equal(sent.length, 1)
  assert.equal(JSON.parse(sent[0].payload).title, "Phone alerts are on")
  sent = []
  await POST(req("POST", { subscription: subscription() })) // a quiet re-sync sends nothing
  assert.equal(sent.length, 0)
})

test("API: DELETE removes just that phone", async () => {
  signIn()
  addSub(GOOD, "s1")
  addSub(GOOD2, "s2")
  const { DELETE } = await route()
  assert.equal((await DELETE(req("DELETE", {}))).status, 400)
  assert.equal((await DELETE(req("DELETE", { endpoint: GOOD }))).status, 200)
  assert.deepEqual(subs.map((s) => s.id), ["s2"])
})
