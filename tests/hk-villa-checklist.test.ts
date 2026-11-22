import { test } from "node:test"
import assert from "node:assert/strict"
import { VILLA_AREAS, VILLA_UNIT_TYPE } from "../lib/hk/villa-checklist"

test("villa checklist areas are valid for the HK module", () => {
  assert.ok(VILLA_AREAS.length > 0)
  for (const a of VILLA_AREAS) {
    assert.ok(a.title.trim().length > 0)
    assert.ok(a.instructions.trim().length > 0)
    assert.ok(Number.isInteger(a.minPhotos) && a.minPhotos >= 0 && a.minPhotos <= 10, a.title)
    assert.ok(a.requiresVideo || a.minPhotos > 0, `${a.title} needs a photo or a video`)
  }
  assert.equal(new Set(VILLA_AREAS.map((a) => a.title)).size, VILLA_AREAS.length)
})

test("genset and diesel needs photo proof", () => {
  const genset = VILLA_AREAS.find((a) => a.title === "Genset and diesel")
  assert.ok(genset && genset.minPhotos >= 3)
})

test("villa template matches the Villa unit type", () => {
  assert.equal(VILLA_UNIT_TYPE, "Villa")
})
