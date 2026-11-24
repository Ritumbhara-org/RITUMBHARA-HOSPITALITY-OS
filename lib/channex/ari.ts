// Builds the payloads for POST /availability and POST /restrictions.
// Rules (from the Channex integration notes): compress consecutive equal days into ranges, never send past dates,
// send only what changed, keep availability and restrictions as separate messages.

import { addDays, eachNight } from "./dates"
import { toMinor } from "./money"
import type { AvailabilityValue, RestrictionValue } from "./types"

export interface DayCell<T> {
  date: string
  value: T
}

/** Collapse consecutive dates holding an equal value into { date_from, date_to, value }. Compares the whole value object. */
export function compressRanges<T extends object>(cells: DayCell<T>[]): { date_from: string; date_to: string; value: T }[] {
  const sorted = [...cells].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const out: { date_from: string; date_to: string; value: T }[] = []
  for (const c of sorted) {
    const last = out[out.length - 1]
    if (last && addDays(last.date_to, 1) === c.date && sameValue(last.value, c.value)) last.date_to = c.date
    else if (!last || last.date_to !== c.date) out.push({ date_from: c.date, date_to: c.date, value: c.value })
    // A repeated date is ignored: the first entry for a date wins.
  }
  return out
}

function sameValue(a: object, b: object): boolean {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  if (ka.length !== kb.length) return false
  return ka.every((k, i) => k === kb[i] && (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k])
}

export function dropPastDates<T>(cells: DayCell<T>[], today: string): DayCell<T>[] {
  return cells.filter((c) => c.date >= today)
}

/** Free rooms per night. Holds and blocks count as occupied; overbooked nights clamp to 0. */
export function computeAvailability(countOfRooms: number, occupiedByDate: Map<string, number>, dates: string[]): DayCell<{ availability: number }>[] {
  return dates.map((date) => ({ date, value: { availability: Math.max(0, countOfRooms - (occupiedByDate.get(date) ?? 0)) } }))
}

/** How many rooms of a room type each night of a stay occupies. Cancelled stays must be excluded by the caller. */
export function addStayToOccupancy(occupied: Map<string, number>, checkIn: string, checkOut: string, rooms = 1): void {
  for (const night of eachNight(checkIn, checkOut)) occupied.set(night, (occupied.get(night) ?? 0) + rooms)
}

export function buildAvailabilityValues(propertyId: string, roomTypeId: string, cells: DayCell<{ availability: number }>[], today: string): AvailabilityValue[] {
  return compressRanges(dropPastDates(cells, today)).map((r) => ({
    property_id: propertyId,
    room_type_id: roomTypeId,
    ...rangeKeys(r.date_from, r.date_to),
    availability: r.value.availability,
  }))
}

export interface RestrictionFields {
  /** Rupees. */
  rate?: number
  minStay?: number
  stopSell?: boolean
  closedToArrival?: boolean
  closedToDeparture?: boolean
}

/** Only the fields present are sent, so a price edit cannot clobber min-stay or closures (Channex applies partial updates). */
export function buildRestrictionValues(propertyId: string, ratePlanId: string, cells: DayCell<RestrictionFields>[], today: string): RestrictionValue[] {
  const wire = cells.map((c) => ({ date: c.date, value: toWire(c.value) }))
  return compressRanges(dropPastDates(wire, today)).map((r) => ({
    property_id: propertyId,
    rate_plan_id: ratePlanId,
    ...rangeKeys(r.date_from, r.date_to),
    ...r.value,
  }))
}

function toWire(f: RestrictionFields): Omit<RestrictionValue, "property_id" | "rate_plan_id" | "date" | "date_from" | "date_to"> {
  const w: Record<string, number | boolean> = {}
  if (f.rate !== undefined) w.rate = toMinor(f.rate)
  if (f.minStay !== undefined) w.min_stay_arrival = f.minStay
  if (f.stopSell !== undefined) w.stop_sell = f.stopSell
  if (f.closedToArrival !== undefined) w.closed_to_arrival = f.closedToArrival
  if (f.closedToDeparture !== undefined) w.closed_to_departure = f.closedToDeparture
  return w
}

function rangeKeys(from: string, to: string): { date: string } | { date_from: string; date_to: string } {
  return from === to ? { date: from } : { date_from: from, date_to: to }
}

/** Channex rejects very large bodies (10 MB). Split a values array into batches well under that. */
export function batch<T>(values: T[], size = 500): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}
