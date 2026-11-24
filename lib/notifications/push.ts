// Phone alerts: sends each admin notification to every phone or browser that turned alerts on (web push). SERVER-ONLY.
//
// Needs two environment variables (make a pair with `npx web-push generate-vapid-keys`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY      and optionally VAPID_SUBJECT (a mailto: address, defaults to support).
// Without them nothing is sent and nothing breaks: the bell still works inside the app.
//
// The message is encrypted end to end between this server and the phone; Google, Apple and Mozilla only carry it.
// sendPushToAdmin() never throws: a push is an extra on top of the notification that was already stored.

import webpush from "web-push"
import { prisma } from "@/lib/prisma"
import type { NotificationSeverity } from "./builders"

if (typeof window !== "undefined") {
  throw new Error("lib/notifications/push is server-only and must not be imported in browser code.")
}

export interface PushMessage {
  title: string
  body?: string | null
  href?: string | null
  severity: NotificationSeverity
  groupKey?: string | null
}

const DEFAULT_SUBJECT = "mailto:studios.jaipur@gmail.com"
const MAX_SUBSCRIPTIONS = 50
const SEND_TIMEOUT_MS = 5000
const TTL_SECONDS = 24 * 60 * 60

export function pushConfig(env: Record<string, string | undefined> = process.env): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = (env.VAPID_PUBLIC_KEY || "").trim()
  const privateKey = (env.VAPID_PRIVATE_KEY || "").trim()
  if (!publicKey || !privateKey) return null
  const subject = (env.VAPID_SUBJECT || "").trim() || DEFAULT_SUBJECT
  return { publicKey, privateKey, subject }
}

// The server posts to whatever address a phone registers, so only the real browser push services are accepted.
const PUSH_HOST_SUFFIXES = [".googleapis.com", ".mozilla.com", ".push.apple.com", ".notify.windows.com"]

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

export async function sendPushToAdmin(message: PushMessage): Promise<void> {
  try {
    const cfg = pushConfig()
    if (!cfg) return

    const subscriptions = await prisma.pushSubscription.findMany({ take: MAX_SUBSCRIPTIONS })
    if (subscriptions.length === 0) return

    const payload = JSON.stringify({
      title: message.title,
      body: message.body ?? "",
      href: message.href ?? "/dashboard",
      severity: message.severity,
      tag: message.groupKey ?? undefined,
    })
    const options = {
      vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
      TTL: TTL_SECONDS,
      urgency: message.severity === "CRITICAL" ? ("high" as const) : ("normal" as const),
      timeout: SEND_TIMEOUT_MS,
    }

    const results = await Promise.allSettled(
      subscriptions.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options)),
    )

    // 404 / 410 mean the phone uninstalled the app or revoked permission: forget it.
    const gone = subscriptions
      .filter((_, i) => {
        const r = results[i]
        return r.status === "rejected" && [404, 410].includes((r.reason as { statusCode?: number } | undefined)?.statusCode ?? 0)
      })
      .map((s) => s.id)
    if (gone.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } })

    results.forEach((r, i) => {
      if (r.status === "rejected" && !gone.includes(subscriptions[i].id)) {
        console.error("[Push] could not send to one device", (r.reason as { statusCode?: number } | undefined)?.statusCode ?? r.reason)
      }
    })
  } catch (err) {
    console.error("[Push] could not send", err)
  }
}

export interface StoredSubscription {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export async function saveSubscription(sub: StoredSubscription): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent?.slice(0, 300) ?? null },
    update: { p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent?.slice(0, 300) ?? null },
  })
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } })
}
