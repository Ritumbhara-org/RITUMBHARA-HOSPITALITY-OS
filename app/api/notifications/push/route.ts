import { NextResponse } from "next/server"
import { adminApiGuard } from "@/lib/auth/guard"
import { notifyAdmin } from "@/lib/notifications/service"
import { isAllowedPushEndpoint, pushConfig, removeSubscription, saveSubscription } from "@/lib/notifications/push"

export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE })

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Tells the app whether phone alerts are set up on the server, and the public key a phone needs to subscribe.
export async function GET() {
  const denied = await adminApiGuard()
  if (denied) return denied
  const cfg = pushConfig()
  return NextResponse.json({ success: true, configured: cfg !== null, publicKey: cfg?.publicKey ?? null }, { headers: NO_STORE })
}

// Body: { subscription: { endpoint, keys: { p256dh, auth } }, userAgent? } from PushManager.subscribe().toJSON().
export async function POST(request: Request) {
  const denied = await adminApiGuard()
  if (denied) return denied
  if (!pushConfig()) return bad("push_not_configured", 503)
  const body = await readJson(request)
  const sub = (body?.subscription ?? null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!isAllowedPushEndpoint(endpoint)) return bad("invalid_endpoint")
  if (typeof p256dh !== "string" || typeof auth !== "string" || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return bad("invalid_keys")
  const userAgent = typeof body?.userAgent === "string" ? body.userAgent : null
  try {
    await saveSubscription({ endpoint, p256dh, auth, userAgent })
    // Right after turning alerts on, the phone asks for one alert so the admin sees it working.
    if (body?.test === true) {
      await notifyAdmin({
        type: "PHONE_ALERTS_ON",
        severity: "INFO",
        title: "Phone alerts are on",
        body: "You will get an alert like this when a guest writes or a booking comes in.",
        href: "/dashboard",
      })
    }
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (err) {
    // Most likely the PushSubscription table has not been created yet.
    console.error("[Push API]", err)
    return bad("could_not_save", 500)
  }
}

// Body: { endpoint } (turns alerts off for that phone).
export async function DELETE(request: Request) {
  const denied = await adminApiGuard()
  if (denied) return denied
  const body = await readJson(request)
  const endpoint = body?.endpoint
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 1000) return bad("invalid_endpoint")
  try {
    await removeSubscription(endpoint)
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (err) {
    console.error("[Push API]", err)
    return bad("could_not_remove", 500)
  }
}
