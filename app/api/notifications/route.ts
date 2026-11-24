import { NextResponse } from "next/server"
import { adminApiGuard } from "@/lib/auth/guard"
import { listNotifications, markNotificationsRead } from "@/lib/notifications/service"

export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

// The bell polls this. Admin session required (the proxy checks too; this is the close-to-the-data check).
export async function GET() {
  const denied = await adminApiGuard()
  if (denied) return denied
  try {
    const { items, unread } = await listNotifications(30)
    return NextResponse.json({ success: true, items, unread }, { headers: NO_STORE })
  } catch (err) {
    // Most likely the AdminNotification table has not been pushed to the database yet.
    console.error("[Notifications API]", err)
    return NextResponse.json({ success: true, items: [], unread: 0, setupNeeded: true }, { headers: NO_STORE })
  }
}

// Body: { ids: string[] } marks those read; { all: true } marks every unread notification read.
export async function POST(request: Request) {
  const denied = await adminApiGuard()
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400, headers: NO_STORE })
  }
  const { ids, all } = (body ?? {}) as { ids?: unknown; all?: unknown }
  const validIds = Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)
  if (!validIds && all !== true) {
    return NextResponse.json({ success: false, error: "ids_or_all_required" }, { status: 400, headers: NO_STORE })
  }
  try {
    const updated = await markNotificationsRead(all === true ? undefined : (ids as string[]))
    return NextResponse.json({ success: true, updated }, { headers: NO_STORE })
  } catch (err) {
    console.error("[Notifications API]", err)
    return NextResponse.json({ success: false, error: "could_not_update" }, { status: 500, headers: NO_STORE })
  }
}
