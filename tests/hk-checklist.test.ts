import { test } from "node:test"
import assert from "node:assert/strict"
import { pickTemplate, missingRequirements, isCaptureTimeValid } from "../lib/hk/checklist"

const t = (id: string, unitType: string | null, isActive = true) => ({ id, unitType, isActive })

test("pickTemplate prefers the matching unit type, case-insensitive", () => {
  const list = [t("any", null), t("studio", "Studio"), t("bhk", "3BHK")]
  assert.equal(pickTemplate(list, "studio")?.id, "studio")
  assert.equal(pickTemplate(list, " 3bhk ")?.id, "bhk")
})

test("pickTemplate falls back to the generic template, then to null", () => {
  assert.equal(pickTemplate([t("any", null), t("studio", "Studio")], "Villa")?.id, "any")
  assert.equal(pickTemplate([t("studio", "Studio")], "Villa"), null)
})

test("pickTemplate ignores inactive templates", () => {
  assert.equal(pickTemplate([t("studio", "Studio", false), t("any", null)], "Studio")?.id, "any")
  assert.equal(pickTemplate([t("studio", "Studio", false)], "Studio"), null)
})

const areas = [
  { id: "a1", title: "Bathroom", minPhotos: 2, requiresVideo: true },
  { id: "a2", title: "Bed", minPhotos: 1, requiresVideo: false },
]

test("missingRequirements lists exactly what is still needed", () => {
  const m = missingRequirements(areas, [
    { areaId: "a1", kind: "PHOTO" },
    { areaId: "a2", kind: "PHOTO" },
  ])
  assert.deepEqual(m, [{ areaId: "a1", title: "Bathroom", needPhotos: 1, needVideo: true }])
})

test("missingRequirements is empty when proof is complete", () => {
  const m = missingRequirements(areas, [
    { areaId: "a1", kind: "PHOTO" },
    { areaId: "a1", kind: "PHOTO" },
    { areaId: "a1", kind: "VIDEO" },
    { areaId: "a2", kind: "PHOTO" },
  ])
  assert.deepEqual(m, [])
})

test("missingRequirements: a video does not count as a photo", () => {
  const m = missingRequirements([{ id: "a", title: "Hall", minPhotos: 1, requiresVideo: false }], [{ areaId: "a", kind: "VIDEO" }])
  assert.equal(m[0]?.needPhotos, 1)
})

test("capture time must fall between check-in and now", () => {
  const checkIn = new Date("2026-11-21T10:00:00Z")
  const now = new Date("2026-11-21T10:30:00Z")
  assert.equal(isCaptureTimeValid(new Date("2026-11-21T10:10:00Z"), checkIn, now), true)
  assert.equal(isCaptureTimeValid(new Date("2026-11-21T09:30:00Z"), checkIn, now), false) // older footage
  assert.equal(isCaptureTimeValid(new Date("2026-11-21T11:00:00Z"), checkIn, now), false) // future
  assert.equal(isCaptureTimeValid(new Date("2026-11-21T09:57:00Z"), checkIn, now), true) // within clock drift
  assert.equal(isCaptureTimeValid(new Date("nope"), checkIn, now), false)
})

import { startOfDayIST } from "../lib/hk/time"

test("startOfDayIST returns midnight India time as UTC", () => {
  // 2026-11-21 18:30 IST = 13:00 UTC; day started 2026-11-20 18:30 UTC
  assert.equal(startOfDayIST(new Date("2026-11-21T13:00:00Z")).toISOString(), "2026-11-20T18:30:00.000Z")
  // 00:10 IST on the 22nd = 18:40 UTC on the 21st; day started 18:30 UTC on the 21st
  assert.equal(startOfDayIST(new Date("2026-11-21T18:40:00Z")).toISOString(), "2026-11-21T18:30:00.000Z")
})

test("areasForUnit keeps shared areas and only that unit's extra spaces", async () => {
  const { areasForUnit } = await import("../lib/hk/checklist")
  const list = [
    { id: "all", unitId: null },
    { id: "u1-balcony", unitId: "u1" },
    { id: "u2-balcony", unitId: "u2" },
  ]
  assert.deepEqual(areasForUnit(list, "u1").map((a) => a.id), ["all", "u1-balcony"])
  assert.deepEqual(areasForUnit(list, "u3").map((a) => a.id), ["all"])
})
