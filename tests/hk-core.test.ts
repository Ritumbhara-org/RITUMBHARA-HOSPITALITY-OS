import { test } from "node:test"
import assert from "node:assert/strict"
import {
  hashSecret,
  verifySecret,
  isValidPinFormat,
  isLocked,
  nextLockState,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
} from "../lib/hk/secret"
import { haversineMeters, checkGeofence, MAX_ACCURACY_M } from "../lib/hk/geo"
import { normalizeMobile } from "../lib/hk/validation"

test("hashSecret round-trips and rejects wrong PIN", () => {
  const h = hashSecret("4821")
  assert.ok(h.startsWith("scrypt$"))
  assert.equal(verifySecret("4821", h), true)
  assert.equal(verifySecret("4822", h), false)
})

test("hashSecret uses a fresh salt each time", () => {
  assert.notEqual(hashSecret("4821"), hashSecret("4821"))
})

test("verifySecret fails closed on missing or malformed hashes", () => {
  assert.equal(verifySecret("1234", null), false)
  assert.equal(verifySecret("1234", ""), false)
  assert.equal(verifySecret("1234", "plain"), false)
  assert.equal(verifySecret("1234", "scrypt$zz$zz"), false)
})

test("PIN format is 4 to 6 digits", () => {
  for (const ok of ["1234", "12345", "123456"]) assert.equal(isValidPinFormat(ok), true)
  for (const bad of ["123", "1234567", "12a4", "", " 1234"]) assert.equal(isValidPinFormat(bad), false)
})

test("lockout triggers on the fifth wrong attempt", () => {
  const now = new Date("2026-11-21T10:00:00Z")
  let attempts = 0
  for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
    const s = nextLockState(attempts, now)
    assert.equal(s.lockedUntil, null)
    attempts = s.failedAttempts
  }
  const last = nextLockState(attempts, now)
  assert.equal(last.failedAttempts, 0)
  assert.equal(last.lockedUntil?.getTime(), now.getTime() + LOCK_MINUTES * 60_000)
})

test("isLocked respects the expiry time", () => {
  const now = new Date("2026-11-21T10:00:00Z")
  assert.equal(isLocked(null, now), false)
  assert.equal(isLocked(new Date("2026-11-21T10:05:00Z"), now), true)
  assert.equal(isLocked(new Date("2026-11-21T09:59:00Z"), now), false)
})

test("haversine: one degree of latitude is about 111 km", () => {
  const d = haversineMeters({ lat: 26.9, lng: 75.8 }, { lat: 27.9, lng: 75.8 })
  assert.ok(Math.abs(d - 111_195) < 300)
})

test("geofence accepts a point inside the radius", () => {
  const center = { lat: 26.9124, lng: 75.7873 }
  const r = checkGeofence({ lat: 26.9126, lng: 75.7874, accuracyM: 20 }, center, 150)
  assert.equal(r.ok, true)
})

test("geofence rejects a point outside the radius", () => {
  const center = { lat: 26.9124, lng: 75.7873 }
  const r = checkGeofence({ lat: 26.9224, lng: 75.7873, accuracyM: 20 }, center, 150)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "TOO_FAR")
})

test("geofence rejects a weak GPS fix and bad coordinates", () => {
  const center = { lat: 26.9124, lng: 75.7873 }
  const weak = checkGeofence({ lat: 26.9124, lng: 75.7873, accuracyM: MAX_ACCURACY_M + 1 }, center, 150)
  assert.equal(weak.ok, false)
  if (!weak.ok) assert.equal(weak.reason, "WEAK_SIGNAL")
  const bad = checkGeofence({ lat: NaN, lng: 75.7873 }, center, 150)
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.reason, "BAD_COORDS")
  const out = checkGeofence({ lat: 120, lng: 75.7873 }, center, 150)
  assert.equal(out.ok, false)
})

test("mobile numbers normalize to +91 E.164 and reject junk", () => {
  assert.equal(normalizeMobile("98765 43210"), "+919876543210")
  assert.equal(normalizeMobile("+91-98765-43210"), "+919876543210")
  assert.equal(normalizeMobile("09876543210"), "+919876543210")
  assert.equal(normalizeMobile("12345"), null)
  assert.equal(normalizeMobile("5876543210"), null)
  assert.equal(normalizeMobile(""), null)
  assert.equal(normalizeMobile(null), null)
})
