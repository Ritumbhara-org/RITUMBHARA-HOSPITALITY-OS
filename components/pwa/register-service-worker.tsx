"use client"

import { useEffect } from "react"

// Registers /sw.js so the OS can be installed as an app and shows an offline page instead of a browser error.
export function RegisterServiceWorker({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.warn("[PWA] service worker registration failed", err)
    })
  }, [enabled])
  return null
}
