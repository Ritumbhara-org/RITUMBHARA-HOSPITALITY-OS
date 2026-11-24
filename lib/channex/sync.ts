// Content sync: property -> room types -> rate plans, in dependency order. POST when no mapping exists, PUT when one does,
// store the returned UUID. Safe to run again forever.

import type { ChannexClient } from "./client"
import type { MappingStore } from "./mapping"
import { toMinor } from "./money"

export interface LocalProperty {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  city?: string | null
  state?: string | null
  address?: string | null
  country?: string | null // 2-letter code
  timezone?: string | null
  currency?: string
}
export interface LocalRoomType {
  id: string
  title: string
  countOfRooms: number
  occAdults: number
  occChildren: number
  occInfants: number
  defaultOccupancy: number
}
export interface LocalRatePlan {
  id: string
  roomTypeId: string
  title: string
  currency: string
  /** Rupees. Channex needs an option rate on create; real prices go in through restrictions. */
  baseRate: number
}

export interface ContentSyncInput {
  property: LocalProperty
  roomTypes: LocalRoomType[]
  ratePlans: LocalRatePlan[]
}
export interface ContentSyncResult {
  propertyId: string
  roomTypeIds: Record<string, string>
  ratePlanIds: Record<string, string>
  created: number
  updated: number
}

const compact = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")) as Partial<T>

export async function syncContent(client: ChannexClient, store: MappingStore, input: ContentSyncInput): Promise<ContentSyncResult> {
  let created = 0
  let updated = 0
  const upsert = async (kind: "property" | "room_type" | "rate_plan", localId: string, attrs: Record<string, unknown>, create: () => Promise<{ data: { id: string } }>, update: (id: string) => Promise<unknown>) => {
    const existing = await store.get(kind, localId)
    if (existing) { await update(existing); updated++; return existing }
    const res = await create()
    await store.set(kind, localId, res.data.id)
    created++
    return res.data.id
  }

  const p = input.property
  const propAttrs = compact({
    title: p.name, currency: p.currency ?? "INR", email: p.email, phone: p.phone, city: p.city, state: p.state,
    address: p.address, country: p.country, timezone: p.timezone ?? "Asia/Kolkata",
  })
  const propertyId = await upsert("property", p.id, propAttrs, () => client.createProperty(propAttrs), (id) => client.updateProperty(id, propAttrs))

  const roomTypeIds: Record<string, string> = {}
  for (const rt of input.roomTypes) {
    const attrs = {
      property_id: propertyId, title: rt.title, count_of_rooms: rt.countOfRooms,
      occ_adults: rt.occAdults, occ_children: rt.occChildren, occ_infants: rt.occInfants,
      default_occupancy: Math.min(rt.defaultOccupancy, rt.occAdults), room_kind: "room",
    }
    roomTypeIds[rt.id] = await upsert("room_type", rt.id, attrs, () => client.createRoomType(attrs), (id) => client.updateRoomType(id, attrs))
  }

  const ratePlanIds: Record<string, string> = {}
  for (const rp of input.ratePlans) {
    const roomTypeChannexId = roomTypeIds[rp.roomTypeId] ?? (await store.get("room_type", rp.roomTypeId))
    if (!roomTypeChannexId) throw new Error(`Rate plan ${rp.id} references room type ${rp.roomTypeId} that is not synced`)
    const attrs = {
      property_id: propertyId, room_type_id: roomTypeChannexId, title: rp.title, currency: rp.currency,
      sell_mode: "per_room", rate_mode: "manual",
      options: [{ occupancy: input.roomTypes.find((r) => r.id === rp.roomTypeId)?.defaultOccupancy ?? 1, is_primary: true, rate: toMinor(rp.baseRate) }],
    }
    ratePlanIds[rp.id] = await upsert("rate_plan", rp.id, attrs, () => client.createRatePlan(attrs), (id) => client.updateRatePlan(id, attrs))
  }
  return { propertyId, roomTypeIds, ratePlanIds, created, updated }
}
