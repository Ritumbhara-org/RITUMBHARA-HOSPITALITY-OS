// Ritumbhara OS service worker. Kept deliberately small:
// - pages and API calls always go to the network (nothing private is cached on the phone);
// - if the network is down, page loads show /offline.html instead of the browser's error;
// - Next.js build files (/_next/static, content-hashed) are cached so the app opens faster.
const VERSION = "ritumbhara-os-v1"
const STATIC_CACHE = VERSION + "-static"
const OFFLINE_URL = "/offline.html"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
  }
  // Everything else (API, uploads, media, RSC data): straight to the network, never cached.
})

// Phone alerts (web push). The server sends { title, body, href, severity, tag }; nothing is cached here.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Ritumbhara OS", body: event.data ? event.data.text() : "" }
  }
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { href: typeof data.href === "string" ? data.href : "/dashboard" },
    // Critical alerts stay on screen until tapped. A repeat with the same tag replaces the earlier one and buzzes again.
    requireInteraction: data.severity === "CRITICAL",
  }
  if (data.tag) {
    options.tag = String(data.tag)
    options.renotify = true
  }
  event.waitUntil(self.registration.showNotification(data.title || "Ritumbhara OS", options))
})

// Tapping an alert opens the page where the admin can act, reusing the app window if it is already open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  let target = new URL("/dashboard", self.location.origin)
  try {
    const wanted = new URL((event.notification.data && event.notification.data.href) || "/dashboard", self.location.origin)
    if (wanted.origin === self.location.origin) target = wanted
  } catch {
    // keep the dashboard
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        try {
          await client.focus()
          if ("navigate" in client) await client.navigate(target.href)
          return
        } catch {
          // fall through to opening a new window
        }
      }
      await self.clients.openWindow(target.href)
    }),
  )
})
