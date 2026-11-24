import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { clientFromEnv, ingestWebhookRevision } from "@/lib/channex/runtime"
import { checkWebhookSecret } from "@/lib/channex/webhook-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Channex booking webhook (machine-to-machine). Self-authenticated: the request must carry the header
//   x-channex-secret: <CHANNEX_WEBHOOK_SECRET>
// (set it in the webhook's `headers` when registering it). With no secret configured every request is refused.
// The webhook is only a notification: the revision is pulled by id from Channex, applied, then acknowledged.

export async function POST(request: Request) {
  const auth = checkWebhookSecret(request.headers.get("x-channex-secret"), process.env.CHANNEX_WEBHOOK_SECRET)
  if (auth === "unconfigured") return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 })
  if (auth === "unauthorized") return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const client = clientFromEnv()
  if (!client) return NextResponse.json({ error: "channex_not_configured" }, { status: 503 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }) }
  const revisionId = typeof body?.payload?.revision_id === "string" ? body.payload.revision_id : null
  if (!revisionId) return NextResponse.json({ ok: true, ignored: "no revision_id" }) // not a booking event we handle

  try {
    const res = await ingestWebhookRevision(prisma, client, revisionId)
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    console.error("[channex webhook] failed", revisionId, e)
    // 500 so Channex shows the failure; the revision stays un-acked and the feed poll retries it inside the 30-minute window.
    return NextResponse.json({ ok: false, error: "apply_failed" }, { status: 500 })
  }
}
