import { createHmac, timingSafeEqual } from "node:crypto"

// Shared-secret check for the Channex webhook. Constant-time; a missing or short secret refuses everything.
export const MIN_WEBHOOK_SECRET_LENGTH = 16
const digest = (v: string) => createHmac("sha256", "channex-webhook-compare").update(v).digest()

export function checkWebhookSecret(header: string | null | undefined, secret: string | undefined): "ok" | "unconfigured" | "unauthorized" {
  const s = (secret ?? "").trim()
  if (s.length < MIN_WEBHOOK_SECRET_LENGTH) return "unconfigured"
  if (!header) return "unauthorized"
  return timingSafeEqual(digest(header), digest(s)) ? "ok" : "unauthorized"
}
