// Inbound OTA bookings. Channex delivers them as revisions (feed and/or webhook). Core rules:
//  - apply first, ack only after a successful apply; a failure stays un-acked so it retries inside Channex's 30-minute window
//  - the feed is a 30-minute window, not a durable queue: drain until empty, keep going past a failure, and report it loudly
//  - never drop an OTA booking, even when no room is free (it is created flagged as overbooked)
//  - "modified" revisions are NOT auto-applied: they are flagged for a human
//  - the feed covers the whole Channex account, so revisions for properties outside the OS are acked and skipped
//  - dedupe by Channex booking id through the mapping store

import type { ChannexClient } from "./client"
import { isDateKey } from "./dates"
import type { MappingStore } from "./mapping"
import { fromMajorString } from "./money"
import type { NormalizedRevision, NormalizedRevisionRoom } from "./types"

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const dateOrNull = (v: unknown): string | null => (isDateKey(v) ? v : null)

export function parseRevision(raw: { id?: string; attributes?: Record<string, any> } | null | undefined): NormalizedRevision | null {
  const a = raw?.attributes
  if (!raw?.id || !a) return null
  const bookingId = str(a.booking_id)
  const status = a.status === "new" || a.status === "modified" || a.status === "cancelled" ? a.status : null
  if (!bookingId || !status) return null
  const c = a.customer ?? {}
  const rooms: NormalizedRevisionRoom[] = (Array.isArray(a.rooms) ? a.rooms : []).map((r: any) => {
    const days: Record<string, number> = {}
    for (const [d, price] of Object.entries(r?.days ?? {})) {
      const n = fromMajorString(price)
      if (isDateKey(d) && n !== null) days[d] = n
    }
    return {
      roomTypeId: str(r?.room_type_id),
      ratePlanId: str(r?.rate_plan_id),
      checkinDate: dateOrNull(r?.checkin_date),
      checkoutDate: dateOrNull(r?.checkout_date),
      amount: fromMajorString(r?.amount),
      adults: Number(r?.occupancy?.adults) || 1,
      children: Number(r?.occupancy?.children) || 0,
      days,
    }
  })
  return {
    revisionId: raw.id,
    bookingId,
    status,
    propertyId: str(a.property_id),
    otaName: str(a.ota_name),
    otaReservationCode: str(a.ota_reservation_code),
    arrivalDate: dateOrNull(a.arrival_date),
    departureDate: dateOrNull(a.departure_date),
    amount: fromMajorString(a.amount),
    currency: str(a.currency),
    paymentCollect: str(a.payment_collect),
    customer: {
      name: [str(c.name), str(c.surname)].filter(Boolean).join(" ") || "OTA Guest",
      email: str(c.mail),
      phone: str(c.phone),
    },
    rooms,
  }
}

export interface NativeBookingInput {
  revision: NormalizedRevision
  propertyLocalId: string
  roomTypeLocalId: string | null
  room: NormalizedRevisionRoom
  /** Stay dates for this room, falling back to the booking's overall dates. */
  checkIn: string
  checkOut: string
}

export interface ApplyDeps {
  store: MappingStore
  /** Creates the reservation. `overbooked` is true when no room was free and it was created flagged. Must be safe to call once per room. */
  createReservation(input: NativeBookingInput): Promise<{ reservationId: string; overbooked: boolean }>
  cancelReservation(reservationId: string): Promise<void>
  /** A human needs to look at this OTA modification. Nothing is changed on the calendar. */
  flagModification(revision: NormalizedRevision, reservationIds: string[]): Promise<void>
  /** Availability must be re-pushed for these room types after a create or cancel. */
  markAvailabilityDirty?(propertyLocalId: string, roomTypeLocalIds: string[]): Promise<void>
}

export type ApplyOutcome =
  | { outcome: "created"; reservationIds: string[]; overbooked: boolean }
  | { outcome: "cancelled"; reservationIds: string[] }
  | { outcome: "modification_flagged"; reservationIds: string[] }
  | { outcome: "duplicate" }
  | { outcome: "skipped_foreign_property" }
  | { outcome: "cancel_unknown_booking" }

const slot = (bookingId: string, i: number) => (i === 0 ? bookingId : `${bookingId}#${i}`)

async function reservationsFor(store: MappingStore, bookingId: string): Promise<string[]> {
  const out: string[] = []
  for (let i = 0; i < 50; i++) {
    const id = await store.get("booking", slot(bookingId, i))
    if (!id) break
    out.push(id)
  }
  return out
}

export async function applyRevision(rev: NormalizedRevision, deps: ApplyDeps): Promise<ApplyOutcome> {
  const propertyLocalId = rev.propertyId ? await deps.store.getLocal("property", rev.propertyId) : null
  if (!propertyLocalId) return { outcome: "skipped_foreign_property" }

  const existing = await reservationsFor(deps.store, rev.bookingId)

  if (rev.status === "cancelled") {
    if (!existing.length) return { outcome: "cancel_unknown_booking" }
    for (const id of existing) await deps.cancelReservation(id)
    await touch(deps, propertyLocalId, rev)
    return { outcome: "cancelled", reservationIds: existing }
  }

  if (rev.status === "modified") {
    // Blindly applying OTA changes to a live calendar needs reconciliation UX; flag it for a human instead.
    await deps.flagModification(rev, existing)
    return { outcome: "modification_flagged", reservationIds: existing }
  }

  if (existing.length) return { outcome: "duplicate" }
  const rooms = rev.rooms.length ? rev.rooms : [{ roomTypeId: null, ratePlanId: null, checkinDate: null, checkoutDate: null, amount: rev.amount, adults: 1, children: 0, days: {} }]
  const ids: string[] = []
  let overbooked = false
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i]
    const checkIn = room.checkinDate ?? rev.arrivalDate
    const checkOut = room.checkoutDate ?? rev.departureDate
    if (!checkIn || !checkOut) throw new Error(`Revision ${rev.revisionId} has no stay dates`)
    const roomTypeLocalId = room.roomTypeId ? await deps.store.getLocal("room_type", room.roomTypeId) : null
    const res = await deps.createReservation({ revision: rev, propertyLocalId, roomTypeLocalId, room, checkIn, checkOut })
    await deps.store.set("booking", slot(rev.bookingId, i), res.reservationId)
    ids.push(res.reservationId)
    overbooked ||= res.overbooked
  }
  await touch(deps, propertyLocalId, rev)
  return { outcome: "created", reservationIds: ids, overbooked }
}

async function touch(deps: ApplyDeps, propertyLocalId: string, rev: NormalizedRevision) {
  if (!deps.markAvailabilityDirty) return
  const ids: string[] = []
  for (const r of rev.rooms) {
    const local = r.roomTypeId ? await deps.store.getLocal("room_type", r.roomTypeId) : null
    if (local && !ids.includes(local)) ids.push(local)
  }
  if (ids.length) await deps.markAvailabilityDirty(propertyLocalId, ids)
}

export interface DrainResult {
  seen: number
  acked: number
  failed: { revisionId: string; error: string }[]
  outcomes: Record<string, number>
}

/** Pull the feed oldest-first, apply, ack. Keeps going past a failure; stops when a page makes no progress or the feed is empty. */
export interface DrainOptions {
  maxPages?: number
  /** Called once per revision, after it was applied (outcome set) or failed (error set). For audit logging. */
  onResult?: (info: { revisionId: string; revision: NormalizedRevision | null; outcome: string | null; error: string | null }) => void | Promise<void>
}

export async function drainFeed(client: ChannexClient, deps: ApplyDeps, opts: DrainOptions = {}): Promise<DrainResult> {
  const result: DrainResult = { seen: 0, acked: 0, failed: [], outcomes: {} }
  const failedIds = new Set<string>()
  for (let page = 0; page < (opts.maxPages ?? 20); page++) {
    const { data } = await client.feed()
    const items = (Array.isArray(data) ? data : []).filter((i) => !failedIds.has(i.id))
    if (!items.length) break
    let progress = 0
    for (const item of items) {
      result.seen++
      let rev: NormalizedRevision | null = null
      try {
        rev = parseRevision(item)
        if (!rev) throw new Error("Unparseable revision")
        const out = await applyRevision(rev, deps)
        await client.ackRevision(item.id)
        result.acked++
        progress++
        result.outcomes[out.outcome] = (result.outcomes[out.outcome] ?? 0) + 1
        await opts.onResult?.({ revisionId: item.id, revision: rev, outcome: out.outcome, error: null })
      } catch (e) {
        failedIds.add(item.id)
        const error = e instanceof Error ? e.message : String(e)
        result.failed.push({ revisionId: item.id, error })
        await opts.onResult?.({ revisionId: item.id, revision: rev, outcome: null, error })
      }
    }
    if (!progress) break
  }
  return result
}

/** Webhook path: the webhook only carries ids. Pull the revision by id (the source of truth), apply, ack. */
export async function applyRevisionById(client: ChannexClient, deps: ApplyDeps, revisionId: string): Promise<ApplyOutcome> {
  const { data } = await client.getRevision(revisionId)
  const rev = parseRevision(data)
  if (!rev) throw new Error(`Revision ${revisionId} could not be parsed`)
  const out = await applyRevision(rev, deps)
  await client.ackRevision(revisionId)
  return out
}
