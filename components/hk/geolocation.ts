"use client"

export type Fix = { lat: number; lng: number; accuracyM: number }

// Best GPS reading within a few seconds. Phones often start with a rough fix (indoors, hills),
// so keep listening and return the most accurate one; stop early once it is good enough.
const GOOD_ENOUGH_M = 40

export function getFix(timeoutMs = 15000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("यह फ़ोन लोकेशन नहीं दे सकता।"))
      return
    }
    let best: Fix | null = null
    let done = false
    const finish = (fix: Fix | null, err?: GeolocationPositionError) => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      if (fix) {
        resolve(fix)
        return
      }
      reject(
        new Error(
          err && err.code === err.PERMISSION_DENIED
            ? "लोकेशन बंद है। ब्राउज़र की सेटिंग में इस साइट के लिए लोकेशन चालू करें।"
            : "लोकेशन नहीं मिल सकी। लोकेशन चालू करके दोबारा कोशिश करें।"
        )
      )
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }
        if (!best || fix.accuracyM < best.accuracyM) best = fix
        if (best.accuracyM <= GOOD_ENOUGH_M) finish(best)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED || !best) finish(best, err)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    )
    const timer = setTimeout(() => finish(best), Math.min(timeoutMs, 12_000))
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
