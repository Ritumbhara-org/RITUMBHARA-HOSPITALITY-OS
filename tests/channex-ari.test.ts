import { test } from "node:test"
import assert from "node:assert/strict"
import { addStayToOccupancy, buildAvailabilityValues, buildRestrictionValues, compressRanges, computeAvailability, batch } from "../lib/channex/ari"
import { eachNight, toDateKey, addDays } from "../lib/channex/dates"
import { toMinor } from "../lib/channex/money"

test("compressRanges merges consecutive equal days and splits on a change or a gap", () => {
  const out = compressRanges([
    { date: "2026-12-01", value: { availability: 2 } },
    { date: "2026-12-02", value: { availability: 2 } },
    { date: "2026-12-03", value: { availability: 1 } },
    { date: "2026-12-05", value: { availability: 1 } },
  ])
  assert.deepEqual(out, [
    { date_from: "2026-12-01", date_to: "2026-12-02", value: { availability: 2 } },
    { date_from: "2026-12-03", date_to: "2026-12-03", value: { availability: 1 } },
    { date_from: "2026-12-05", date_to: "2026-12-05", value: { availability: 1 } },
  ])
})

test("compressRanges compares the whole value, not just one field, and ignores input order and duplicate dates", () => {
  const out = compressRanges([
    { date: "2026-12-02", value: { rate: 100, min: 2 } },
    { date: "2026-12-01", value: { rate: 100, min: 1 } },
    { date: "2026-12-02", value: { rate: 999, min: 9 } },
  ])
  assert.equal(out.length, 2)
  assert.deepEqual(out[1].value, { rate: 100, min: 2 })
})

test("availability: holds count as occupied, overbooked nights clamp to 0, past dates are never sent", () => {
  const occ = new Map<string, number>()
  addStayToOccupancy(occ, "2026-12-10", "2026-12-12") // nights 10 and 11
  addStayToOccupancy(occ, "2026-12-10", "2026-12-11")
  addStayToOccupancy(occ, "2026-12-10", "2026-12-11") // third room on a 2-room type
  const cells = computeAvailability(2, occ, ["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12"])
  assert.deepEqual(cells.map((c) => c.value.availability), [2, 0, 1, 2])
  const values = buildAvailabilityValues("P", "RT", cells, "2026-12-10")
  assert.deepEqual(values, [
    { property_id: "P", room_type_id: "RT", date: "2026-12-10", availability: 0 },
    { property_id: "P", room_type_id: "RT", date: "2026-12-11", availability: 1 },
    { property_id: "P", room_type_id: "RT", date: "2026-12-12", availability: 2 },
  ])
})

test("a stay occupies check-in night through the night before check-out", () => {
  assert.deepEqual(eachNight("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01"])
  assert.deepEqual(eachNight("2026-12-30", "2026-12-30"), [])
  assert.equal(addDays("2026-02-28", 1), "2026-03-01")
})

test("toDateKey uses the property's local calendar date, not UTC", () => {
  const d = new Date("2026-12-10T20:00:00Z") // 01:30 on the 11th in IST
  assert.equal(toDateKey(d, "Asia/Kolkata"), "2026-12-11")
  assert.equal(toDateKey(d, "UTC"), "2026-12-10")
})

test("restrictions: a rate-only edit sends only the rate (in paise), so min-stay and closures are untouched", () => {
  const v = buildRestrictionValues("P", "RP", [
    { date: "2026-12-20", value: { rate: 3500.5 } },
    { date: "2026-12-21", value: { rate: 3500.5 } },
  ], "2026-12-01")
  assert.deepEqual(v, [{ property_id: "P", rate_plan_id: "RP", date_from: "2026-12-20", date_to: "2026-12-21", rate: 350050 }])
  assert.ok(!("min_stay_arrival" in v[0]) && !("stop_sell" in v[0]))
})

test("restrictions: explicit false is sent (re-opening a closed date), undefined is not", () => {
  const v = buildRestrictionValues("P", "RP", [{ date: "2026-12-20", value: { stopSell: false, minStay: 2 } }], "2026-12-01")
  assert.equal(v[0].stop_sell, false)
  assert.equal(v[0].min_stay_arrival, 2)
  assert.ok(!("rate" in v[0]))
})

test("toMinor avoids float drift and batch splits evenly", () => {
  assert.equal(toMinor(1999.99), 199999)
  assert.equal(toMinor(0.1 + 0.2), 30)
  assert.deepEqual(batch([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})
