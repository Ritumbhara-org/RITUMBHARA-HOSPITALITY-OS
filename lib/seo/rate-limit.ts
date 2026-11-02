// Abuse guard for the Website SEO Audit. SERVER-ONLY, in-memory (per server instance).
//
// Each audit makes up to ~8 outbound web requests and one paid LLM call, so even for signed-in admins it is capped:
//   - at most MAX_PER_WINDOW audits started per WINDOW_MS per caller,
//   - at most MAX_CONCURRENT audits running at the same time on this instance.
// On serverless hosting each instance keeps its own counters, so this is a cost/abuse brake, not a hard guarantee
// (same trade-off as lib/auth/rate-limit.ts).

import type { SeoErrorCode } from "./errors"

export const WINDOW_MS = 10 * 60 * 1000
export const MAX_PER_WINDOW = 10
export const MAX_CONCURRENT = 2
const MAX_TRACKED = 500

const starts = new Map<string, number[]>()
let running = 0

export type AuditSlot = { ok: true; release: () => void } | { ok: false; code: Extract<SeoErrorCode, "rate_limited" | "busy"> }

export function acquireAuditSlot(key: string, nowMs: number = Date.now()): AuditSlot {
  const recent = (starts.get(key) ?? []).filter((t) => nowMs - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    starts.set(key, recent)
    return { ok: false, code: "rate_limited" }
  }
  if (running >= MAX_CONCURRENT) return { ok: false, code: "busy" }

  if (!starts.has(key) && starts.size >= MAX_TRACKED) starts.delete(starts.keys().next().value as string)
  recent.push(nowMs)
  starts.set(key, recent)
  running += 1
  let released = false
  return {
    ok: true,
    release: () => {
      if (released) return
      released = true
      running = Math.max(0, running - 1)
    },
  }
}

export function resetSeoRateLimit() {
  starts.clear()
  running = 0
}
