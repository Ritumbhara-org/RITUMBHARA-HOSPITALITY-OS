// Geofence checks for housekeeper check-in and check-out.
// Location is a signal, not proof: a phone can fake GPS. We store the
// coordinates and accuracy with every action so an admin can review them.

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// A fix worse than this is too vague to trust, so we ask the user to retry.
export const MAX_ACCURACY_M = 100

export type GeofenceResult =
  | { ok: true; distanceM: number }
  | { ok: false; reason: "BAD_COORDS" | "WEAK_SIGNAL" | "TOO_FAR"; distanceM?: number }

export function checkGeofence(
  point: { lat: number; lng: number; accuracyM?: number | null },
  center: { lat: number; lng: number },
  radiusM: number
): GeofenceResult {
  const valid =
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  if (!valid) return { ok: false, reason: "BAD_COORDS" }
  if (point.accuracyM != null && point.accuracyM > MAX_ACCURACY_M) {
    return { ok: false, reason: "WEAK_SIGNAL" }
  }
  const distanceM = haversineMeters({ lat: point.lat, lng: point.lng }, center)
  if (distanceM > radiusM) return { ok: false, reason: "TOO_FAR", distanceM }
  return { ok: true, distanceM }
}
