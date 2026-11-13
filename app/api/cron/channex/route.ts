import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cronGuard } from "@/lib/auth/cron"
import { clientFromEnv, ingestFeed } from "@/lib/channex/runtime"
import { pushPropertyFull } from "@/lib/channex/push"
import { PrismaMappingStore } from "@/lib/channex/store"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/cron/channex?job=feed   -> drain the booking feed (backstop for webhooks; run every 1 to 15 minutes)
// GET /api/cron/channex?job=full   -> full availability + rates push for every NATIVE property (drift correction; hourly)
// Needs "Authorization: Bearer <CRON_SECRET>". Only properties with pmsMode = NATIVE are touched.
export async function GET(request: Request) {
  // Cron service only: requires "Authorization: Bearer <CRON_SECRET>". Refused if CRON_SECRET is not configured.
  const denied = cronGuard(request);
  if (denied) return denied;
  const client = clientFromEnv()
  if (!client) return NextResponse.json({ status: "skipped", reason: "CHANNEX_API_KEY not set" })

  const job = new URL(request.url).searchParams.get("job") ?? "feed"
  try {
    if (job === "feed") {
      const res = await ingestFeed(prisma, client)
      // Failed revisions expire out of the feed after ~30 minutes, so surface them loudly.
      if (res.failed.length) console.error("[channex cron] revisions failed to apply:", JSON.stringify(res.failed))
      return NextResponse.json({ status: res.failed.length ? "partial" : "success", ...res })
    }
    if (job === "full") {
      const props = await prisma.property.findMany({ where: { pmsMode: "NATIVE" }, select: { id: true, name: true } })
      const store = new PrismaMappingStore(prisma)
      const results: Record<string, unknown> = {}
      for (const p of props) results[p.name] = await pushPropertyFull(prisma, client, store, p.id)
      return NextResponse.json({ status: "success", properties: props.length, results })
    }
    return NextResponse.json({ status: "error", reason: "unknown job" }, { status: 400 })
  } catch (e) {
    console.error("[channex cron] failed", e)
    return NextResponse.json({ status: "error", reason: e instanceof Error ? e.message : "failed" }, { status: 500 })
  }
}
