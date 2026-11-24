// Orchestration used by the webhook route, the cron route and the doctor: build the client from env, ingest bookings,
// then re-push availability for any room type whose bookings changed.

import { prisma } from "@/lib/prisma"
import { applyRevisionById, drainFeed, parseRevision, type ApplyDeps, type DrainResult } from "./bookings"
import { ChannexClient, configFromEnv } from "./client"
import { pushRoomTypeAvailability } from "./push"
import { PrismaMappingStore, buildApplyDeps, logRevision } from "./store"

type Db = typeof prisma

export function clientFromEnv(): ChannexClient | null {
  const cfg = configFromEnv()
  return cfg ? new ChannexClient(cfg) : null
}

function trackingDeps(db: Db, dirty: Set<string>): ApplyDeps {
  const base = buildApplyDeps(db, new PrismaMappingStore(db))
  return { ...base, markAvailabilityDirty: async (_p, roomTypeIds) => { roomTypeIds.forEach((id) => dirty.add(id)) } }
}

async function pushDirty(db: Db, client: ChannexClient, dirty: Set<string>) {
  const store = new PrismaMappingStore(db)
  const errors: string[] = []
  for (const id of dirty) {
    try { await pushRoomTypeAvailability(db, client, store, id) } catch (e) { errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return errors
}

/** Cron path: drain the account-wide feed, log each revision, then push availability for what changed. */
export async function ingestFeed(db: Db, client: ChannexClient): Promise<DrainResult & { pushErrors: string[] }> {
  const dirty = new Set<string>()
  const res = await drainFeed(client, trackingDeps(db, dirty), {
    onResult: ({ revisionId, revision, outcome, error }) => logRevision(db, revisionId, revision?.bookingId ?? "unknown", revision?.status ?? "unknown", outcome, error),
  })
  return { ...res, pushErrors: await pushDirty(db, client, dirty) }
}

/** Webhook path: pull the revision by id, apply, ack, then push availability. */
export async function ingestWebhookRevision(db: Db, client: ChannexClient, revisionId: string) {
  const dirty = new Set<string>()
  try {
    const out = await applyRevisionById(client, trackingDeps(db, dirty), revisionId)
    const { data } = await client.getRevision(revisionId).catch(() => ({ data: null }))
    const rev = parseRevision(data as any)
    await logRevision(db, revisionId, rev?.bookingId ?? "unknown", rev?.status ?? "unknown", out.outcome, null)
    return { outcome: out.outcome, pushErrors: await pushDirty(db, client, dirty) }
  } catch (e) {
    await logRevision(db, revisionId, "unknown", "unknown", null, e instanceof Error ? e.message : String(e))
    throw e
  }
}
