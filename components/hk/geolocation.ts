"use client"

export type Fix = { lat: number; lng: number; accuracyM: number }

// One high-accuracy GPS reading. Rejects with a readable message.
export function getFix(timeoutMs = 15000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This phone cannot share its location."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked. Allow location for this site in your browser settings."
              : "Could not get your location. Try again."
          )
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 }
    )
  })
}

// Best-effort fix for proof items: never blocks the upload if GPS is slow.
export async function tryFix(): Promise<Fix | null> {
  try {
    return await getFix(5000)
  } catch {
    return null
  }
}
