import type { MetaStatusEvent } from "./parse";

// Applies Meta delivery-status webhooks (sent / delivered / read / failed) to the OUTBOUND WhatsAppMessage row that
// carries the same provider message id (wamid). Status only moves FORWARD (SENT -> DELIVERED -> READ), because Meta
// can deliver these events out of order or twice; FAILED is only applied to a message that has not been delivered.

type Next = "SENT" | "DELIVERED" | "READ" | "FAILED";

// New status -> the current statuses it may replace.
const MAY_REPLACE: Record<Next, string[]> = {
  SENT: ["PENDING"],
  DELIVERED: ["PENDING", "SENT"],
  READ: ["PENDING", "SENT", "DELIVERED"],
  FAILED: ["PENDING", "SENT"],
};

const STATE_TO_STATUS: Record<MetaStatusEvent["status"], Next> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };

export interface StatusDeps {
  // Returns how many rows changed (0 = unknown message, or already at or past this status).
  update?: (providerMessageId: string, next: Next, mayReplace: string[]) => Promise<number>;
}

async function defaultUpdate(providerMessageId: string, next: Next, mayReplace: string[]): Promise<number> {
  const { prisma } = await import("@/lib/prisma"); // lazy: importing this module (e.g. from the route) needs no database
  const r = await prisma.whatsAppMessage.updateMany({
    where: { direction: "OUTBOUND", providerMessageId, status: { in: mayReplace } },
    data: { status: next },
  });
  return r.count;
}

export interface StatusSummary {
  received: number;
  updated: number;
  failed: number;
}

export async function applyMetaStatuses(events: MetaStatusEvent[], deps: StatusDeps = {}): Promise<StatusSummary> {
  const update = deps.update || defaultUpdate;
  const summary: StatusSummary = { received: events.length, updated: 0, failed: 0 };
  for (const ev of events) {
    const next = STATE_TO_STATUS[ev.status];
    if (next === "FAILED") {
      summary.failed++;
      // Code and title only: never the recipient number or message text.
      console.warn("[meta-webhook] delivery_failed code=" + (ev.errorCode ?? "unknown") + (ev.errorTitle ? " title=" + ev.errorTitle : ""));
    }
    try {
      summary.updated += await update(ev.id, next, MAY_REPLACE[next]);
    } catch (err) {
      console.error("[meta-webhook] status_update_failed", err instanceof Error ? err.name : "unknown");
    }
  }
  return summary;
}
