// Outbound ARI: compute availability and restrictions from the OS database and push them to Channex.
// Availability is derived from reservations on every push (never stored), so it cannot drift from the calendar.

import { prisma } from "@/lib/prisma"
import { addStayToOccupancy, batch, buildAvailabilityValues, buildRestrictionValues, computeAvailability, type DayCell, type RestrictionFields } from "./ari"
import type { ChannexClient } from "./client"
import { addDays, eachDate, toDateKey } from "./dates"
import type { MappingStore } from "./mapping"

type Db = typeof prisma

const DEFAULT_WINDOW_DAYS = 365

export interface PushResult { sent: number; skipped?: string }

/** Push availability for one room type over [today, today + days]. Needs the property and room type already content-synced. */
export async function pushRoomTypeAvailability(db: Db, client: ChannexClient, store: MappingStore, roomTypeId: string, days = DEFAULT_WINDOW_DAYS): Promise<PushResult> {
  const rt = await db.roomType.findUnique({ where: { id: roomTypeId }, include: { property: true } })
  if (!rt) return { sent: 0, skipped: "room type not found" }
  const [chxProperty, chxRoomType] = await Promise.all([store.get("property", rt.propertyId), store.get("room_type", rt.id)])
  if (!chxProperty || !chxRoomType) return { sent: 0, skipped: "not content-synced to Channex yet" }

  const tz = rt.property.timezone || "Asia/Kolkata"
  const today = toDateKey(new Date(), tz)
  const last = addDays(today, days)
  const reservations = await db.reservation.findMany({
    where: { roomTypeId: rt.id, status: { notIn: ["CANCELLED"] }, checkOut: { gt: new Date() } },
    select: { checkIn: true, checkOut: true },
  })
  const occupied = new Map<string, number>()
  for (const r of reservations) addStayToOccupancy(occupied, toDateKey(r.checkIn, tz), toDateKey(r.checkOut, tz))
  const cells = computeAvailability(rt.countOfRooms, occupied, eachDate(today, last))
  const values = buildAvailabilityValues(chxProperty, chxRoomType, cells, today)
  for (const b of batch(values)) await client.pushAvailability(b)
  return { sent: values.length }
}

/** Full restrictions push for a rate plan: every date gets the plan default unless a RateCell overrides it. Drift correction. */
export async function pushRatePlanFull(db: Db, client: ChannexClient, store: MappingStore, ratePlanId: string, days = DEFAULT_WINDOW_DAYS): Promise<PushResult> {
  const rp = await db.ratePlan.findUnique({ where: { id: ratePlanId }, include: { roomType: { include: { property: true } } } })
  if (!rp) return { sent: 0, skipped: "rate plan not found" }
  const [chxProperty, chxRatePlan] = await Promise.all([store.get("property", rp.roomType.propertyId), store.get("rate_plan", rp.id)])
  if (!chxProperty || !chxRatePlan) return { sent: 0, skipped: "not content-synced to Channex yet" }

  const today = toDateKey(new Date(), rp.roomType.property.timezone || "Asia/Kolkata")
  const dates = eachDate(today, addDays(today, days))
  const overrides = await db.rateCell.findMany({ where: { ratePlanId: rp.id, date: { gte: today } } })
  const byDate = new Map(overrides.map((c) => [c.date, c]))
  const cells: DayCell<RestrictionFields>[] = dates.map((date) => {
    const c = byDate.get(date)
    return { date, value: { rate: c?.rate ?? rp.baseRate, minStay: c?.minStay ?? 1, stopSell: c?.stopSell ?? false, closedToArrival: c?.closedToArrival ?? false, closedToDeparture: c?.closedToDeparture ?? false } }
  })
  const values = buildRestrictionValues(chxProperty, chxRatePlan, cells, today)
  for (const b of batch(values)) await client.pushRestrictions(b)
  await db.rateCell.updateMany({ where: { ratePlanId: rp.id, date: { gte: today } }, data: { pushedAt: new Date() } })
  return { sent: values.length }
}

/** Delta push: only cells edited since their last push, and only the fields that were set. A price edit cannot clobber min-stay or closures. */
export async function pushRatePlanDelta(db: Db, client: ChannexClient, store: MappingStore, ratePlanId: string): Promise<PushResult> {
  const rp = await db.ratePlan.findUnique({ where: { id: ratePlanId }, include: { roomType: { include: { property: true } } } })
  if (!rp) return { sent: 0, skipped: "rate plan not found" }
  const [chxProperty, chxRatePlan] = await Promise.all([store.get("property", rp.roomType.propertyId), store.get("rate_plan", rp.id)])
  if (!chxProperty || !chxRatePlan) return { sent: 0, skipped: "not content-synced to Channex yet" }

  const today = toDateKey(new Date(), rp.roomType.property.timezone || "Asia/Kolkata")
  const dirty = await db.rateCell.findMany({ where: { ratePlanId: rp.id, date: { gte: today }, pushedAt: null } })
  // Whoever edits a RateCell must set pushedAt back to null; that is what marks it as not yet sent.
  if (!dirty.length) return { sent: 0 }
  const cells: DayCell<RestrictionFields>[] = dirty.map((c) => {
    const f: RestrictionFields = {}
    if (c.rate !== null) f.rate = c.rate
    if (c.minStay !== null) f.minStay = c.minStay
    if (c.stopSell !== null) f.stopSell = c.stopSell
    if (c.closedToArrival !== null) f.closedToArrival = c.closedToArrival
    if (c.closedToDeparture !== null) f.closedToDeparture = c.closedToDeparture
    return { date: c.date, value: f }
  })
  const values = buildRestrictionValues(chxProperty, chxRatePlan, cells, today)
  for (const b of batch(values)) await client.pushRestrictions(b)
  await db.rateCell.updateMany({ where: { id: { in: dirty.map((c) => c.id) } }, data: { pushedAt: new Date() } })
  return { sent: values.length }
}

/** Everything for one NATIVE property: availability for each room type, full restrictions for each rate plan. */
export async function pushPropertyFull(db: Db, client: ChannexClient, store: MappingStore, propertyId: string) {
  const roomTypes = await db.roomType.findMany({ where: { propertyId }, include: { ratePlans: true } })
  const out = { availability: 0, restrictions: 0, skipped: [] as string[] }
  for (const rt of roomTypes) {
    const a = await pushRoomTypeAvailability(db, client, store, rt.id)
    out.availability += a.sent
    if (a.skipped) out.skipped.push(`${rt.title}: ${a.skipped}`)
    for (const rp of rt.ratePlans) {
      const r = await pushRatePlanFull(db, client, store, rp.id)
      out.restrictions += r.sent
      if (r.skipped) out.skipped.push(`${rt.title}/${rp.title}: ${r.skipped}`)
    }
  }
  return out
}
