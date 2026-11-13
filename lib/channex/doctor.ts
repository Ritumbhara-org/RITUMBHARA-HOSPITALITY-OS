// Health check for the Channex integration. Exit-style result: ok is false if any check fails.
// "The push returned 200" proves nothing, so this reads availability back from Channex and compares it to the OS calendar.

import { prisma } from "@/lib/prisma"
import { addStayToOccupancy, computeAvailability } from "./ari"
import type { ChannexClient } from "./client"
import { addDays, eachDate, toDateKey } from "./dates"
import type { MappingStore } from "./mapping"

type Db = typeof prisma
export interface Check { name: string; ok: boolean; detail: string }

export async function runDoctor(db: Db, client: ChannexClient | null, store: MappingStore, propertyId?: string): Promise<{ ok: boolean; checks: Check[] }> {
  const checks: Check[] = []
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail })

  if (!client) { add("api key configured", false, "CHANNEX_API_KEY is not set"); return { ok: false, checks } }
  add("api key configured", true, client.isProduction ? "PRODUCTION endpoint" : "staging endpoint")

  try { const r = await client.listProperties(); add("api reachable", true, `${r.data.length} properties on the account`) }
  catch (e) { add("api reachable", false, e instanceof Error ? e.message : String(e)); return { ok: false, checks } }

  const props = await db.property.findMany({ where: { pmsMode: "NATIVE", ...(propertyId ? { id: propertyId } : {}) }, include: { roomTypes: { include: { ratePlans: true } } } })
  if (!props.length) add("native properties", false, "no property has pmsMode = NATIVE")

  for (const p of props) {
    const chxProp = await store.get("property", p.id)
    add(`${p.name}: property mapped`, !!chxProp, chxProp ?? "not synced")
    if (!chxProp) continue
    const tz = p.timezone || "Asia/Kolkata"
    const today = toDateKey(new Date(), tz)
    const to = addDays(today, 13)

    let remote: Record<string, Record<string, number>> = {}
    try { remote = (await client.readAvailability(chxProp, today, to)).data ?? {} } catch (e) { add(`${p.name}: availability readback`, false, e instanceof Error ? e.message : String(e)) }

    for (const rt of p.roomTypes) {
      const chxRt = await store.get("room_type", rt.id)
      add(`${p.name} / ${rt.title}: room type mapped`, !!chxRt, chxRt ?? "not synced")
      for (const rp of rt.ratePlans) add(`${p.name} / ${rt.title} / ${rp.title}: rate plan mapped`, !!(await store.get("rate_plan", rp.id)), "")
      if (!chxRt) continue
      const res = await db.reservation.findMany({ where: { roomTypeId: rt.id, status: { notIn: ["CANCELLED"] }, checkOut: { gt: new Date() } }, select: { checkIn: true, checkOut: true } })
      const occ = new Map<string, number>()
      for (const r of res) addStayToOccupancy(occ, toDateKey(r.checkIn, tz), toDateKey(r.checkOut, tz))
      const local = computeAvailability(rt.countOfRooms, occ, eachDate(today, to))
      const theirs = remote[chxRt] ?? {}
      const mismatches = local.filter((c) => theirs[c.date] !== undefined && Number(theirs[c.date]) !== c.value.availability)
      const missing = local.filter((c) => theirs[c.date] === undefined).length
      add(`${p.name} / ${rt.title}: availability matches Channex (next 14 days)`, mismatches.length === 0 && missing === 0,
        mismatches.length ? `${mismatches.length} nights differ, e.g. ${mismatches[0].date}: OS ${mismatches[0].value.availability} vs Channex ${theirs[mismatches[0].date]}` : missing ? `${missing} nights have no value in Channex yet (run a full push)` : "in sync")
    }
  }

  try { const f = await client.feed(); const n = Array.isArray(f.data) ? f.data.length : 0; add("booking feed", n === 0, n ? `${n} unacked revisions waiting` : "empty") }
  catch (e) { add("booking feed", false, e instanceof Error ? e.message : String(e)) }

  return { ok: checks.every((c) => c.ok), checks }
}
