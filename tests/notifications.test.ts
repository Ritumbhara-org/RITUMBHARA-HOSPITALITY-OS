// Admin notifications (the bell): message builders, the feed service, the event listeners and the API route.
// The database is a small in-memory fake, so nothing here needs Postgres or a generated Prisma client.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { SESSION_COOKIE } from "../lib/auth/session"
import { fakeCookies, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

// ---------- fake database ----------

type Row = {
  id: string; type: string; severity: string; title: string; body: string | null; href: string | null
  groupKey: string | null; count: number; propertyId: string | null; readAt: Date | null; createdAt: Date; updatedAt: Date
}
let rows: Row[] = []
let seq = 0
let dbDown = false
const lookups = {
  reservation: null as unknown,
  ticket: null as unknown,
  unit: null as unknown,
  guest: null as unknown,
}

function guard<T>(fn: () => T): T {
  if (dbDown) throw new Error("relation \"AdminNotification\" does not exist")
  return fn()
}

const fakePrisma = {
  adminNotification: {
    findFirst: async ({ where }: { where: { groupKey?: string; readAt?: null } }) =>
      guard(() =>
        rows
          .filter((r) => (where.groupKey === undefined || r.groupKey === where.groupKey) && (where.readAt === null ? r.readAt === null : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      ),
    create: async ({ data }: { data: Partial<Row> }) =>
      guard(() => {
        seq++
        const row = { id: "n" + seq, count: 1, readAt: null, groupKey: null, propertyId: null, body: null, href: null, createdAt: new Date(1_700_000_000_000 + seq * 1000), updatedAt: new Date(), ...data } as Row
        rows.push(row)
        return row
      }),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      guard(() => {
        const row = rows.find((r) => r.id === where.id) as unknown as Record<string, unknown>
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as object)) row[k] = (row[k] as number) + (v as { increment: number }).increment
          else row[k] = v
        }
        return row
      }),
    findMany: async ({ take }: { take: number }) =>
      guard(() => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take)),
    count: async ({ where }: { where?: { readAt?: null } }) => guard(() => rows.filter((r) => (where?.readAt === null ? r.readAt === null : true)).length),
    updateMany: async ({ where, data }: { where: { id?: { in: string[] }; readAt: null }; data: { readAt: Date } }) =>
      guard(() => {
        const hit = rows.filter((r) => r.readAt === null && (!where.id || where.id.in.includes(r.id)))
        hit.forEach((r) => { r.readAt = data.readAt })
        return { count: hit.length }
      }),
    deleteMany: async ({ where }: { where: { readAt: { not: null; lt: Date } } }) =>
      guard(() => {
        const keep = rows.filter((r) => !(r.readAt !== null && r.readAt < where.readAt.lt))
        const count = rows.length - keep.length
        rows = keep
        return { count }
      }),
  },
  reservation: { findUnique: async () => lookups.reservation },
  ticket: { findUnique: async () => lookups.ticket },
  unit: { findUnique: async () => lookups.unit },
  guest: { findUnique: async () => lookups.guest },
}

mock.module("next/headers", nextHeadersMock)
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: fakePrisma }, defaultExport: fakePrisma })

// A stand-in event bus that remembers each handler, so tests can fire events directly.
const handlers = new Map<string, (payload: unknown) => Promise<void>>()
mock.module(mod("lib/events/bus.ts"), {
  namedExports: { eventBus: { on: (event: string, h: (payload: unknown) => Promise<void>) => { handlers.set(event, h) } } },
})

beforeEach(async () => {
  rows = []
  seq = 0
  dbDown = false
  lookups.reservation = null
  lookups.ticket = null
  lookups.unit = null
  lookups.guest = null
  await setAuthEnv()
  fakeCookies.clear()
})

const builders = () => import(mod("lib/notifications/builders.ts"))
const service = () => import(mod("lib/notifications/service.ts"))

// ---------- builders ----------

test("whatsappMessage: groups by the sender's digits, links to the inbox, clips long text", async () => {
  const b = await builders()
  const n = b.whatsappMessage({ from: "+91 98765-43210", text: "x".repeat(500) })
  assert.equal(n.type, "WHATSAPP_MESSAGE")
  assert.equal(n.groupKey, "wa:919876543210")
  assert.equal(n.href, "/inbox")
  assert.equal(n.severity, "ACTION")
  assert.ok((n.body ?? "").length <= 200)
  assert.equal(b.whatsappMessage({ from: "+911", text: "" }).body, "(media message)")
})

test("safeHref only allows paths inside the OS", async () => {
  const { safeHref } = await builders()
  assert.equal(safeHref("/inbox"), "/inbox")
  assert.equal(safeHref("/operations?x=1"), "/operations?x=1")
  for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil", "inbox", "", null, undefined, "/a\nb"]) {
    assert.equal(safeHref(bad as string | null | undefined), null, String(bad))
  }
})

test("ticketCreated: critical priority is CRITICAL, anything else is an ACTION; SLA breach is always CRITICAL", async () => {
  const b = await builders()
  assert.equal(b.ticketCreated({ ticketId: "t1", description: "AC dead", priority: "CRITICAL" }).severity, "CRITICAL")
  assert.equal(b.ticketCreated({ ticketId: "t2", description: "Towels", priority: "LOW" }).severity, "ACTION")
  assert.equal(b.ticketCreated({ ticketId: "t3", description: "Leak", priority: "HIGH", unitName: "Studio 4" }).title, "New guest request · Studio 4 · high priority")
  assert.equal(b.slaBreached({ ticketId: "t1", description: "AC", priority: "LOW" }).severity, "CRITICAL")
})

test("booking notifications name the guest and unit and show dates, source and amount", async () => {
  const b = await builders()
  const facts = { guestName: "Asha Rao", unitName: "Studio 4", checkIn: new Date("2026-11-02T08:00:00Z"), checkOut: new Date("2026-11-05T08:00:00Z"), source: "Airbnb", totalAmount: 12500 }
  const created = b.bookingCreated(facts)
  assert.equal(created.title, "New booking · Asha Rao · Studio 4")
  assert.match(created.body ?? "", /2 Nov → 5 Nov · Airbnb · ₹12,500/)
  assert.equal(created.severity, "INFO")
  assert.equal(b.bookingCancelled(facts).severity, "ACTION")
})

test("otaMessage uses the channel's name and one group per conversation", async () => {
  const b = await builders()
  const n = b.otaMessage({ channel: "BOOKING_COM", guestName: "Ravi", body: "Can we check in early?", conversationId: "c9" })
  assert.equal(n.title, "New Booking.com message from Ravi")
  assert.equal(n.groupKey, "inbox:c9")
  assert.equal(b.otaMessage({ channel: "EMAIL", guestName: null, body: "Hi", conversationId: "c1" }).title, "New Email message from a guest")
})

// ---------- service ----------

test("notifyAdmin stores a notification; a link outside the OS is dropped", async () => {
  const { notifyAdmin } = await service()
  await notifyAdmin({ type: "T", severity: "INFO", title: "Hello", href: "https://evil.com" })
  await notifyAdmin({ type: "T", severity: "INFO", title: "Hello 2", href: "/inbox" })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].href, null)
  assert.equal(rows[1].href, "/inbox")
})

test("notifyAdmin: repeats about the same thing collapse into one unread row; a read one starts a new row", async () => {
  const { notifyAdmin, markNotificationsRead } = await service()
  await notifyAdmin({ type: "WHATSAPP_MESSAGE", severity: "INFO", title: "First", body: "one", groupKey: "wa:1" })
  await notifyAdmin({ type: "WHATSAPP_MESSAGE", severity: "CRITICAL", title: "Second", body: "two", groupKey: "wa:1" })
  await notifyAdmin({ type: "WHATSAPP_MESSAGE", severity: "INFO", title: "Third", body: "three", groupKey: "wa:1" })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].count, 3)
  assert.equal(rows[0].body, "three")
  assert.equal(rows[0].severity, "CRITICAL") // never goes back down while unread

  await markNotificationsRead()
  await notifyAdmin({ type: "WHATSAPP_MESSAGE", severity: "INFO", title: "After read", groupKey: "wa:1" })
  assert.equal(rows.length, 2)
  assert.equal(rows[1].count, 1)
})

test("notifyAdmin never throws, even when the table does not exist", async () => {
  const { notifyAdmin } = await service()
  dbDown = true
  const origError = console.error
  console.error = () => {}
  try {
    await assert.doesNotReject(() => notifyAdmin({ type: "T", severity: "INFO", title: "x", groupKey: "g" }))
  } finally {
    console.error = origError
  }
})

test("listNotifications: newest first with the unread total; markNotificationsRead by ids or all", async () => {
  const { notifyAdmin, listNotifications, markNotificationsRead } = await service()
  for (const t of ["a", "b", "c"]) await notifyAdmin({ type: "T", severity: "INFO", title: t })
  let list = await listNotifications(2)
  assert.deepEqual(list.items.map((i: { title: string }) => i.title), ["c", "b"])
  assert.equal(list.unread, 3)

  assert.equal(await markNotificationsRead([rows[0].id]), 1)
  list = await listNotifications(10)
  assert.equal(list.unread, 2)
  assert.equal(list.items.find((i: { title: string }) => i.title === "a")?.read, true)

  assert.equal(await markNotificationsRead(), 2)
  assert.equal((await listNotifications(10)).unread, 0)
})

test("pruneNotifications deletes only read notifications older than 30 days", async () => {
  const { notifyAdmin, pruneNotifications } = await service()
  for (const t of ["old read", "recent read", "old unread"]) await notifyAdmin({ type: "T", severity: "INFO", title: t })
  const day = 24 * 60 * 60 * 1000
  rows[0].readAt = new Date(Date.now() - 40 * day)
  rows[1].readAt = new Date(Date.now() - 2 * day)
  assert.equal(await pruneNotifications(), 1)
  assert.deepEqual(rows.map((r) => r.title), ["recent read", "old unread"])
})

// ---------- event listeners ----------

async function fire(event: string, payload: unknown) {
  const { initNotificationListeners } = await import(mod("lib/notifications/listeners.ts"))
  initNotificationListeners()
  const h = handlers.get(event)
  assert.ok(h, "no handler registered for " + event)
  await h(payload)
}

const day = 24 * 60 * 60 * 1000
const bookingRow = (checkOutOffsetDays: number) => ({
  guest: { name: "Asha Rao" }, unit: { name: "Studio 4" },
  checkIn: new Date(Date.now() + (checkOutOffsetDays - 3) * day), checkOut: new Date(Date.now() + checkOutOffsetDays * day),
  source: "Booking.com", totalAmount: 9000, propertyId: "p1",
})
const bookingPayload = (checkOutOffsetDays: number) => ({
  reservationId: "r1", guestId: "g1", propertyId: "p1", intellistayBookingId: "i1", status: "CONFIRMED",
  checkIn: new Date(Date.now() + (checkOutOffsetDays - 3) * day), checkOut: new Date(Date.now() + checkOutOffsetDays * day),
})

test("BOOKING_CREATED for an upcoming stay notifies; a stay that already ended (history import) does not", async () => {
  lookups.reservation = bookingRow(5)
  await fire("BOOKING_CREATED", bookingPayload(5))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].type, "BOOKING_CREATED")
  assert.equal(rows[0].title, "New booking · Asha Rao · Studio 4")

  rows = []
  lookups.reservation = bookingRow(-10)
  await fire("BOOKING_CREATED", bookingPayload(-10))
  assert.equal(rows.length, 0)
})

test("BOOKING_CANCELLED notifies as an action", async () => {
  lookups.reservation = bookingRow(5)
  await fire("BOOKING_CANCELLED", bookingPayload(5))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].type, "BOOKING_CANCELLED")
  assert.equal(rows[0].severity, "ACTION")
})

test("TICKET_CREATED notifies with the unit name; SLA_BREACHED is critical; POINTS_REDEEMED names the guest", async () => {
  lookups.ticket = { unit: { name: "Studio 4" } }
  await fire("TICKET_CREATED", { ticketId: "t1", propertyId: "p1", category: "MAINTENANCE", priority: "HIGH", description: "Geyser not working" })
  assert.match(rows[0].title, /Studio 4 · high priority/)
  assert.equal(rows[0].body, "Geyser not working")

  lookups.unit = { name: "Studio 4" }
  await fire("SLA_BREACHED", { ticketId: "t1", description: "Geyser not working", priority: "HIGH", unitId: "u1", slaDeadline: new Date() })
  assert.equal(rows[1].severity, "CRITICAL")

  lookups.guest = { name: "Asha Rao" }
  await fire("POINTS_REDEEMED", { guestId: "g1", propertyId: "p1", reservationId: "r1", pointsRedeemed: 500, rupeeDiscount: 250 })
  assert.equal(rows[2].title, "Points redeemed · Asha Rao")
  assert.match(rows[2].body ?? "", /500 points for ₹250 off/)
})

test("a listener never throws when a lookup fails", async () => {
  const origError = console.error
  console.error = () => {}
  try {
    fakePrisma.reservation.findUnique = async () => { throw new Error("db down") }
    await assert.doesNotReject(() => fire("BOOKING_CREATED", bookingPayload(5)))
  } finally {
    console.error = origError
    fakePrisma.reservation.findUnique = async () => lookups.reservation
  }
})

// ---------- API route ----------

type Handlers = { GET: () => Promise<Response>; POST: (req: Request) => Promise<Response> }
const route = async () => (await import(mod("app/api/notifications/route.ts"))) as Handlers
const post = (body: unknown) =>
  new Request("https://os.example.com/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) })

test("API: signed-out requests get 401 and cannot mark anything read", async () => {
  const { notifyAdmin } = await service()
  await notifyAdmin({ type: "T", severity: "INFO", title: "still unread" })
  const { GET, POST } = await route()
  assert.equal((await GET()).status, 401)
  assert.equal((await POST(post({ all: true }))).status, 401)
  assert.equal(rows[0].readAt, null)
})

test("API: GET returns the feed and unread count for the signed-in admin", async () => {
  const { notifyAdmin } = await service()
  await notifyAdmin({ type: "T", severity: "ACTION", title: "Hello", body: "World", href: "/inbox" })
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  const { GET } = await route()
  const res = await GET()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("cache-control"), "no-store")
  const data = await res.json()
  assert.equal(data.unread, 1)
  assert.equal(data.items[0].title, "Hello")
  assert.equal(data.items[0].read, false)
})

test("API: GET reports setupNeeded instead of failing when the table is missing", async () => {
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  dbDown = true
  const origError = console.error
  console.error = () => {}
  try {
    const { GET } = await route()
    const res = await GET()
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { success: true, items: [], unread: 0, setupNeeded: true })
  } finally {
    console.error = origError
  }
})

test("API: POST marks read by ids or all, and rejects anything else", async () => {
  const { notifyAdmin } = await service()
  await notifyAdmin({ type: "T", severity: "INFO", title: "a" })
  await notifyAdmin({ type: "T", severity: "INFO", title: "b" })
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  const { POST } = await route()

  assert.equal((await POST(post("not json"))).status, 400)
  assert.equal((await POST(post({}))).status, 400)
  assert.equal((await POST(post({ ids: [] }))).status, 400)
  assert.equal((await POST(post({ ids: [123] }))).status, 400)
  assert.equal((await POST(post({ all: "yes" }))).status, 400)

  const one = await POST(post({ ids: [rows[0].id] }))
  assert.deepEqual(await one.json(), { success: true, updated: 1 })
  const all = await POST(post({ all: true }))
  assert.deepEqual(await all.json(), { success: true, updated: 1 })
})
