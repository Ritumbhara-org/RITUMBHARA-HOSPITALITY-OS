import { test } from "node:test"
import assert from "node:assert/strict"
import { ChannexClient } from "../lib/channex/client"
import { MemoryMappingStore } from "../lib/channex/mapping"
import { syncContent } from "../lib/channex/sync"
import { applyRevision, drainFeed, parseRevision, type ApplyDeps } from "../lib/channex/bookings"

type Call = { method: string; path: string; body?: any }
function fakeClient(handler: (c: Call) => { status?: number; data?: unknown }) {
  const calls: Call[] = []
  const client = new ChannexClient({ apiKey: "k", baseUrl: "https://staging.channex.io/api/v1" }, {
    retries: 0,
    fetch: async (url, init) => {
      const path = url.replace("https://staging.channex.io/api/v1", "").split("?")[0]
      const call = { method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined }
      calls.push(call)
      const r = handler(call)
      return { status: r.status ?? 200, text: async () => JSON.stringify({ data: r.data }) }
    },
  })
  return { client, calls }
}

const input = {
  property: { id: "p1", name: "Villa Aravali", country: "IN", city: "Jaipur" },
  roomTypes: [{ id: "rt1", title: "Deluxe", countOfRooms: 3, occAdults: 2, occChildren: 1, occInfants: 0, defaultOccupancy: 2 }],
  ratePlans: [{ id: "rp1", roomTypeId: "rt1", title: "Standard", currency: "INR", baseRate: 3000 }],
}

test("content sync: first run POSTs in dependency order, second run PUTs (idempotent), mapping is stored", async () => {
  let n = 0
  const store = new MemoryMappingStore()
  const a = fakeClient(() => ({ status: 201, data: { id: `uuid-${++n}` } }))
  const first = await syncContent(a.client, store, input)
  assert.deepEqual(a.calls.map((c) => `${c.method} ${c.path}`), ["POST /properties", "POST /room_types", "POST /rate_plans"])
  assert.equal(first.created, 3)
  assert.equal(a.calls[1].body.room_type.property_id, "uuid-1")
  assert.equal(a.calls[2].body.rate_plan.room_type_id, "uuid-2")
  assert.equal(a.calls[2].body.rate_plan.options[0].rate, 300000) // paise

  const b = fakeClient(() => ({ data: {} }))
  const second = await syncContent(b.client, store, input)
  assert.deepEqual(b.calls.map((c) => `${c.method} ${c.path}`), ["PUT /properties/uuid-1", "PUT /room_types/uuid-2", "PUT /rate_plans/uuid-3"])
  assert.equal(second.created, 0)
  assert.equal(second.updated, 3)
})

test("content sync: default occupancy never exceeds adults; null fields are omitted", async () => {
  const a = fakeClient(() => ({ status: 201, data: { id: "x" } }))
  await syncContent(a.client, new MemoryMappingStore(), { ...input, roomTypes: [{ ...input.roomTypes[0], defaultOccupancy: 5 }] })
  assert.equal(a.calls[1].body.room_type.default_occupancy, 2)
  assert.ok(!("email" in a.calls[0].body.property))
})

const rev = (over: Record<string, any> = {}, attrs: Record<string, any> = {}) => ({
  id: over.id ?? "rev-1",
  attributes: {
    booking_id: "bk-1", status: "new", property_id: "chx-prop", ota_name: "Booking.com", ota_reservation_code: "BK123",
    arrival_date: "2026-12-10", departure_date: "2026-12-12", amount: "6000.00", currency: "INR",
    customer: { name: "Asha", surname: "Rao", mail: "a@x.com", phone: "+919800000000" },
    rooms: [{ room_type_id: "chx-rt", rate_plan_id: "chx-rp", checkin_date: "2026-12-10", checkout_date: "2026-12-12", amount: "6000.00", occupancy: { adults: 2, children: 0 }, days: { "2026-12-10": "3000.00", "2026-12-11": "3000.00" } }],
    ...attrs,
  },
})

async function setup() {
  const store = new MemoryMappingStore()
  await store.set("property", "p1", "chx-prop")
  await store.set("room_type", "rt1", "chx-rt")
  const log: string[] = []
  let seq = 0
  const deps: ApplyDeps = {
    store,
    createReservation: async (i) => { log.push(`create ${i.propertyLocalId}/${i.roomTypeLocalId} ${i.checkIn}->${i.checkOut}`); return { reservationId: `res-${++seq}`, overbooked: false } },
    cancelReservation: async (id) => { log.push(`cancel ${id}`) },
    flagModification: async (r, ids) => { log.push(`flag ${r.bookingId} [${ids}]`) },
    markAvailabilityDirty: async (p, rts) => { log.push(`dirty ${p} ${rts}`) },
  }
  return { store, deps, log }
}

test("parseRevision tolerates missing fields and rejects revisions without id, booking or status", () => {
  const ok = parseRevision(rev())!
  assert.equal(ok.customer.name, "Asha Rao")
  assert.equal(ok.amount, 6000)
  assert.deepEqual(ok.rooms[0].days, { "2026-12-10": 3000, "2026-12-11": 3000 })
  assert.equal(parseRevision({ id: "r", attributes: { status: "new" } }), null)
  assert.equal(parseRevision({ id: "r", attributes: { booking_id: "b", status: "weird" } }), null)
  const sparse = parseRevision({ id: "r", attributes: { booking_id: "b", status: "new" } })!
  assert.equal(sparse.customer.name, "OTA Guest")
  assert.deepEqual(sparse.rooms, [])
})

test("new booking creates a reservation, records the mapping, and marks availability dirty", async () => {
  const { deps, log, store } = await setup()
  const out = await applyRevision(parseRevision(rev())!, deps)
  assert.equal(out.outcome, "created")
  assert.deepEqual(log, ["create p1/rt1 2026-12-10->2026-12-12", "dirty p1 rt1"])
  assert.equal(await store.get("booking", "bk-1"), "res-1")
})

test("a resent revision is a duplicate and creates nothing", async () => {
  const { deps, log } = await setup()
  await applyRevision(parseRevision(rev())!, deps)
  log.length = 0
  assert.equal((await applyRevision(parseRevision(rev())!, deps)).outcome, "duplicate")
  assert.deepEqual(log, [])
})

test("multi-room booking creates one reservation per room, and cancelling cancels all of them", async () => {
  const { deps, log } = await setup()
  const two = rev({}, { rooms: [rev().attributes.rooms[0], rev().attributes.rooms[0]] })
  const created = await applyRevision(parseRevision(two)!, deps)
  assert.deepEqual((created as any).reservationIds, ["res-1", "res-2"])
  log.length = 0
  const cancelled = await applyRevision(parseRevision(rev({}, { status: "cancelled", rooms: two.attributes.rooms }))!, deps)
  assert.equal(cancelled.outcome, "cancelled")
  assert.deepEqual(log.filter((l) => l.startsWith("cancel")), ["cancel res-1", "cancel res-2"])
})

test("cancelling a booking the OS never saw is acknowledged without error", async () => {
  const { deps } = await setup()
  assert.equal((await applyRevision(parseRevision(rev({}, { status: "cancelled" }))!, deps)).outcome, "cancel_unknown_booking")
})

test("modifications are flagged for a human and never change the calendar", async () => {
  const { deps, log } = await setup()
  await applyRevision(parseRevision(rev())!, deps)
  log.length = 0
  const out = await applyRevision(parseRevision(rev({}, { status: "modified" }))!, deps)
  assert.equal(out.outcome, "modification_flagged")
  assert.deepEqual(log, ["flag bk-1 [res-1]"])
})

test("revisions for properties outside the OS are skipped", async () => {
  const { deps, log } = await setup()
  const out = await applyRevision(parseRevision(rev({}, { property_id: "someone-elses" }))!, deps)
  assert.equal(out.outcome, "skipped_foreign_property")
  assert.deepEqual(log, [])
})

test("drainFeed: acks only after a successful apply, keeps going past a failure, leaves the failed one un-acked", async () => {
  const { deps } = await setup()
  const good1 = rev({ id: "r1" }, { booking_id: "b1" })
  const bad = rev({ id: "r2" }, { booking_id: "b2", arrival_date: null, departure_date: null, rooms: [] })
  const good2 = rev({ id: "r3" }, { booking_id: "b3" })
  const acked = new Set<string>()
  const { client } = fakeClient((c) => {
    if (c.path === "/booking_revisions/feed") return { data: [good1, bad, good2].filter((r) => !acked.has(r.id)) }
    const m = c.path.match(/\/booking_revisions\/(.+)\/ack/)
    if (m) { acked.add(m[1]); return { data: {} } }
    throw new Error("unexpected " + c.path)
  })
  const res = await drainFeed(client, deps)
  assert.deepEqual([...acked].sort(), ["r1", "r3"])
  assert.equal(res.acked, 2)
  assert.equal(res.failed.length, 1)
  assert.equal(res.failed[0].revisionId, "r2")
  assert.match(res.failed[0].error, /no stay dates/)
})

test("drainFeed stops on an empty feed and when a page makes no progress (no infinite loop)", async () => {
  const { deps } = await setup()
  const empty = fakeClient(() => ({ data: [] }))
  assert.equal((await drainFeed(empty.client, deps)).seen, 0)

  const stuck = fakeClient((c) => (c.path === "/booking_revisions/feed" ? { data: [rev({ id: "r9" }, { rooms: [], arrival_date: null, departure_date: null })] } : { data: {} }))
  const res = await drainFeed(stuck.client, deps)
  assert.equal(res.failed.length, 1)
  assert.equal(stuck.calls.filter((c) => c.path === "/booking_revisions/feed").length, 1)
})
