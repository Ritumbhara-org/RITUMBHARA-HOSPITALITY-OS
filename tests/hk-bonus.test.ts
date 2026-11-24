import { test } from "node:test"
import assert from "node:assert/strict"
import { computeBonus, isValidMonth, monthOfIST, monthRangeIST } from "../lib/hk/bonus"

test("all approved, all 5 stars: awarded", () => {
  const r = computeBonus({ turnoverStatuses: ["APPROVED", "APPROVED"], approvedExemptions: 1, ratings: [5, 5] })
  assert.equal(r.final, "AWARDED")
  assert.equal(r.counts.exempt, 1)
})
test("one rejected turnover fails the month", () => {
  const r = computeBonus({ turnoverStatuses: ["APPROVED", "REJECTED"], approvedExemptions: 0, ratings: [] })
  assert.equal(r.final, "NOT_AWARDED")
})
test("a 4-star review fails the month; no reviews do not", () => {
  assert.equal(computeBonus({ turnoverStatuses: ["APPROVED"], approvedExemptions: 0, ratings: [5, 4] }).final, "NOT_AWARDED")
  assert.equal(computeBonus({ turnoverStatuses: ["APPROVED"], approvedExemptions: 0, ratings: [] }).final, "AWARDED")
})
test("unreviewed turnovers keep it pending; a failure still wins over pending", () => {
  assert.equal(computeBonus({ turnoverStatuses: ["SUBMITTED", "APPROVED"], approvedExemptions: 0, ratings: [] }).final, "PENDING")
  assert.equal(computeBonus({ turnoverStatuses: ["SUBMITTED", "REJECTED"], approvedExemptions: 0, ratings: [] }).final, "NOT_AWARDED")
})
test("admin override wins and keeps its reason", () => {
  const r = computeBonus({ turnoverStatuses: ["REJECTED"], approvedExemptions: 0, ratings: [3], override: { awarded: true, reason: "Guest damaged phone" } })
  assert.equal(r.final, "AWARDED")
  assert.equal(r.computed, "FAILED")
  assert.ok(r.overridden && r.reasons.some((x) => x.includes("Guest damaged phone")))
})
test("a month with no work is eligible (nothing failed)", () => {
  assert.equal(computeBonus({ turnoverStatuses: [], approvedExemptions: 0, ratings: [] }).computed, "ELIGIBLE")
})
test("month helpers use India time", () => {
  assert.equal(isValidMonth("2026-11"), true)
  assert.equal(isValidMonth("2026-13"), false)
  const { start, end } = monthRangeIST("2026-11")
  assert.equal(start.toISOString(), "2026-10-31T18:30:00.000Z")
  assert.equal(end.toISOString(), "2026-11-30T18:30:00.000Z")
  assert.equal(monthOfIST(new Date("2026-10-31T19:00:00Z")), "2026-11")
})
