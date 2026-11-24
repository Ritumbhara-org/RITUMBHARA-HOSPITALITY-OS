"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// loading        still checking this phone
// unsupported    this browser cannot show alerts
// needs-install  iPhone/iPad: alerts only work once the app is added to the Home Screen
// not-configured the server has no VAPID keys yet
// blocked        the person said "Block" (or turned notifications off in phone settings)
// off / on       this phone is not / is subscribed
// working        turning on or off
// error          the last attempt failed
export type PhoneAlertsStatus = "loading" | "unsupported" | "needs-install" | "not-configured" | "blocked" | "off" | "on" | "working" | "error"

export interface PhoneAlertsState {
  status: PhoneAlertsStatus
  enable: () => void
  disable: () => void
}

const READY_TIMEOUT_MS = 6000

function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=")
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Resolves with the active service worker, or null if none is running (for example in development).
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
  ])
}

async function sendSubscription(sub: PushSubscription, test: boolean): Promise<boolean> {
  const res = await fetch("/api/notifications/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent, test }),
  })
  return res.ok
}

// Phone alerts: lets this phone or browser receive notifications even when the app is closed (web push).
// One instance for the whole top bar; the bell only shows the state.
export function usePhoneAlerts(): PhoneAlertsState {
  const [status, setStatus] = useState<PhoneAlertsStatus>("loading")
  const publicKey = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const set = (s: PhoneAlertsStatus) => {
      if (!cancelled) setStatus(s)
    }
    const check = async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
      if (!supported) return set(isIos() && !isStandalone() ? "needs-install" : "unsupported")
      try {
        const res = await fetch("/api/notifications/push", { cache: "no-store" })
        if (!res.ok) return set("unsupported")
        const info = (await res.json()) as { configured?: boolean; publicKey?: string | null }
        if (!info.configured || !info.publicKey) return set("not-configured")
        publicKey.current = info.publicKey
        if (Notification.permission === "denied") return set("blocked")
        const reg = await readyRegistration()
        const existing = reg ? await reg.pushManager.getSubscription() : null
        if (existing && Notification.permission === "granted") {
          // Keep the server's copy fresh (it forgets phones that stopped answering).
          void sendSubscription(existing, false).catch(() => {})
          return set("on")
        }
        set("off")
      } catch {
        set("unsupported")
      }
    }
    const timer = window.setTimeout(() => void check(), 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const enable = useCallback(() => {
    void (async () => {
      const key = publicKey.current
      if (!key) return
      setStatus("working")
      try {
        const permission = await Notification.requestPermission()
        if (permission !== "granted") return setStatus(permission === "denied" ? "blocked" : "off")
        const reg = await readyRegistration()
        if (!reg) return setStatus("error")
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }))
        // test: true makes the server send a first alert, which proves the whole chain works.
        if (await sendSubscription(sub, true)) return setStatus("on")
        await sub.unsubscribe().catch(() => {})
        setStatus("error")
      } catch {
        setStatus("error")
      }
    })()
  }, [])

  const disable = useCallback(() => {
    void (async () => {
      setStatus("working")
      try {
        const reg = await readyRegistration()
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (sub) {
          await fetch("/api/notifications/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {})
          await sub.unsubscribe()
        }
        setStatus("off")
      } catch {
        setStatus("error")
      }
    })()
  }, [])

  return { status, enable, disable }
}
