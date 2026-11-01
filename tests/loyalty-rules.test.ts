// Membership & Loyalty: pure programme rules (points formula, channels, tiers, rolling window, expiry maths).
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  addMonths, calculatePoints, classifyChannel, effectiveTier, eligibleAmount, inQualificationWindow, isOccasionToday, isReservationPaid,
  isValidMemberPhone, nextTierProgress, parseDateOnly, planAllocation, pointsExpiry, summarizePoints, tierForSpend, type CreditBatch,
} from "../lib/loyalty/rules"

test("points formula matches the programme examples", () => {
  assert.equal(calculatePoints(10000, "OTA", "STAR"), 500)
  assert.equal(calculatePoints(10000, "DIRECT", "STAR"), 1000)
  assert.equal(calculatePoints(10000, "DIRECT", "ROCKSTAR"), 2000)
  assert.equal(calculatePoints(10000, "DIRECT", "SUPERSTAR"), 4000)
  assert.equal(calculatePoints(10000, "OTA", "ROCKSTAR"), 1000)
  assert.equal(calculatePoints(10000, "OTA", "SUPERSTAR"), 2000)
})

test("points are floored and never negative", () => {
  assert.equal(calculatePoints(199, "OTA", "STAR"), 9) // 9.95
  assert.equal(calculatePoints(1.1 * 100, "OTA", "STAR"), 5) // 110 * 0.05 = 5.5, no float drift
  assert.equal(calculatePoints(0, "DIRECT", "SUPERSTAR"), 0)
  assert.equal(calculatePoints(-500, "DIRECT", "SUPERSTAR"), 0)
})

test("eligible amount excludes taxes and refunds", () => {
  assert.equal(eligibleAmount({ totalAmount: 11800, taxAmount: 1800 }), 10000)
  assert.equal(eligibleAmount({ totalAmount: 10000, taxAmount: 0, refundedAmount: 2500 }), 7500)
  assert.equal(eligibleAmount({ totalAmount: 1000, taxAmount: 200, refundedAmount: 2000 }), 0)
})

test("booking channel: direct vs OTA, unknown is OTA", () => {
  for (const s of ["Walk-In", "walkin", "DIRECT", "Website", "WhatsApp", "Phone call", "Direct booking"]) assert.equal(classifyChannel(s), "DIRECT", s)
  for (const s of ["Airbnb", "Booking", "Booking.com", "MakeMyTrip", "Agoda", "Goibibo", "Expedia", "OTA"]) assert.equal(classifyChannel(s), "OTA", s)
  assert.equal(classifyChannel("OTA", "Walk-In"), "DIRECT") // the PMS's own source name wins
  assert.equal(classifyChannel("Walk-In", "Airbnb"), "OTA")
  assert.equal(classifyChannel("", null), "OTA")
  assert.equal(classifyChannel("Some new portal"), "OTA")
})

test("tier thresholds", () => {
  assert.equal(tierForSpend(0), "STAR")
  assert.equal(tierForSpend(11999.99), "STAR")
  assert.equal(tierForSpend(12000), "ROCKSTAR")
  assert.equal(tierForSpend(35999), "ROCKSTAR")
  assert.equal(tierForSpend(36000), "SUPERSTAR")
  const p = nextTierProgress(6000, "STAR")
  assert.deepEqual(p, { next: "ROCKSTAR", needed: 6000, percent: 50 })
  assert.equal(nextTierProgress(50000, "SUPERSTAR").next, null)
  // A manual override wins until its end date, then the computed tier applies.
  const now = new Date("2026-11-01T00:00:00Z")
  assert.equal(effectiveTier("STAR", "SUPERSTAR", new Date("2026-12-01T00:00:00Z"), now), "SUPERSTAR")
  assert.equal(effectiveTier("STAR", "SUPERSTAR", new Date("2026-10-01T00:00:00Z"), now), "STAR")
  assert.equal(effectiveTier("SUPERSTAR", "STAR", null, now), "STAR") // manual downgrade
})

test("rolling 6-month qualification window boundaries", () => {
  const now = new Date("2026-11-15T12:00:00Z")
  assert.equal(inQualificationWindow(new Date("2026-05-15T12:00:01Z"), now), true)
  assert.equal(inQualificationWindow(new Date("2026-05-15T12:00:00Z"), now), false) // exactly 6 months ago drops out
  assert.equal(inQualificationWindow(new Date("2026-11-15T12:00:00Z"), now), true)
  assert.equal(inQualificationWindow(new Date("2026-11-16T00:00:00Z"), now), false) // future check-out
})

test("6-month validity uses calendar months and clamps month ends", () => {
  assert.equal(pointsExpiry(new Date("2026-01-15T10:00:00Z")).toISOString(), "2026-07-15T10:00:00.000Z")
  assert.equal(addMonths(new Date("2026-08-31T00:00:00Z"), 6).toISOString(), "2027-02-28T00:00:00.000Z")
  assert.equal(addMonths(new Date("2027-08-31T00:00:00Z"), 6).toISOString(), "2028-02-29T00:00:00.000Z")
})

const batch = (id: string, amount: number, expires: string, allocated = 0): CreditBatch => ({ id, amount, allocated, expiresAt: new Date(expires), createdAt: new Date("2026-01-01T00:00:00Z") })

test("redemption consumes the soonest-expiring batches first (partial redemption)", () => {
  const now = new Date("2026-06-01T00:00:00Z")
  const credits = [batch("late", 500, "2026-12-01T00:00:00Z"), batch("early", 300, "2026-07-01T00:00:00Z"), batch("gone", 400, "2026-05-01T00:00:00Z")]
  const plan = planAllocation(credits, 450, now)
  assert.deepEqual(plan.allocations, [{ creditId: "early", points: 300 }, { creditId: "late", points: 150 }])
  assert.equal(plan.shortfall, 0)
  assert.equal(planAllocation(credits, 900, now).shortfall, 100) // the expired batch is never used
  assert.deepEqual(planAllocation(credits, 100, now, "late").allocations, [{ creditId: "late", points: 100 }]) // reversal of a specific stay
})

test("summary separates available, redeemed, expired and expiring points", () => {
  const now = new Date("2026-06-01T00:00:00Z")
  const credits = [batch("a", 500, "2026-06-20T00:00:00Z", 200), batch("b", 1000, "2026-11-01T00:00:00Z"), batch("old", 300, "2026-05-01T00:00:00Z", 100)]
  const debits = [{ id: "r1", amount: -300, allocated: 300, type: "REDEMPTION" }]
  const s = summarizePoints(credits, debits, now)
  assert.equal(s.available, 300 + 1000)
  assert.equal(s.redeemed, 300)
  assert.equal(s.expired, 200) // old batch lapsed with 200 unused, expiry row not written yet
  assert.equal(s.expiringSoon, 300) // batch "a" expires within 30 days
  assert.equal(s.lifetimeEarned, 1800)
  // A reversal larger than the balance shows as a debt, never as extra points.
  const withDebt = summarizePoints([batch("x", 100, "2026-11-01T00:00:00Z", 100)], [{ id: "rev", amount: -150, allocated: 100, type: "BOOKING_REVERSAL" }], now)
  assert.equal(withDebt.available, -50)
  assert.equal(withDebt.debt, 50)
})

test("birthday/anniversary matching in IST, 29 Feb on 28 Feb in non-leap years", () => {
  const bday = new Date(Date.UTC(1990, 2, 5))
  assert.equal(isOccasionToday(bday, new Date("2026-03-04T19:00:00Z")), true) // 00:30 IST on 5 Mar
  assert.equal(isOccasionToday(bday, new Date("2026-03-04T18:00:00Z")), false) // 23:30 IST on 4 Mar
  const leap = new Date(Date.UTC(1992, 1, 29))
  assert.equal(isOccasionToday(leap, new Date("2027-02-28T06:00:00Z")), true)
  assert.equal(isOccasionToday(leap, new Date("2028-02-28T06:00:00Z")), false)
  assert.equal(isOccasionToday(leap, new Date("2028-02-29T06:00:00Z")), true)
})

test("dates, phones and payment checks", () => {
  const now = new Date("2026-11-01T00:00:00Z")
  assert.equal(parseDateOnly("1990-02-30", now), null)
  assert.equal(parseDateOnly("2030-01-01", now), null)
  assert.equal(parseDateOnly("1990-05-17", now)?.toISOString(), "1990-05-17T00:00:00.000Z")
  assert.equal(isValidMemberPhone("+919876543210"), true)
  assert.equal(isValidMemberPhone("+910000000000"), false) // PMS placeholder
  assert.equal(isValidMemberPhone("+91123"), false)
  assert.equal(isReservationPaid({ paymentStatus: "Paid", paidAmount: 0, totalAmount: 100 }), true)
  assert.equal(isReservationPaid({ paymentStatus: "Pending", paidAmount: 100, totalAmount: 100 }), true)
  assert.equal(isReservationPaid({ paymentStatus: "Pending", paidAmount: 0, totalAmount: 100 }), false)
  assert.equal(isReservationPaid({ paymentStatus: null, paidAmount: null, totalAmount: 100 }), true) // booked in the OS
})
