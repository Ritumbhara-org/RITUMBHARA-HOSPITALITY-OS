import { prisma } from "@/lib/prisma";

// WhatsApp's customer-service window. Free-form (non-template) messages are only delivered within 24 hours of the
// recipient's LAST message to this number; outside it only approved templates can be sent (Meta error 131047).
// We refuse such a send up front, with a clear reason, instead of letting it fail at Meta (or silently never arrive).
// A small safety margin is subtracted because we record an inbound message slightly AFTER the guest sent it.

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;
export const WINDOW_SAFETY_MARGIN_MS = 60 * 1000;

export const WINDOW_CLOSED_MESSAGE =
  "The 24-hour WhatsApp window is closed for this guest. Only an approved template can be sent until they message again.";

export interface WindowDeps {
  // Time of the latest INBOUND message from this phone (digits), or null when they never wrote.
  lastInboundAt?: (digits: string) => Promise<Date | null>;
  now?: () => number;
}

async function defaultLastInboundAt(digits: string): Promise<Date | null> {
  // Inbound rows store the sender as "whatsapp:+<digits>" (Meta and Twilio); tolerate the bare forms too.
  const row = await prisma.whatsAppMessage.findFirst({
    where: { direction: "INBOUND", from: { in: ["whatsapp:+" + digits, "+" + digits, digits] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

// True only when the guest wrote to us within the last 24 hours. Fails CLOSED: when the lookup itself fails the
// window is treated as closed, so a database problem can never turn into an out-of-window free-text send.
export async function isCustomerServiceWindowOpen(phone: string, deps: WindowDeps = {}): Promise<boolean> {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return false;
  try {
    const last = await (deps.lastInboundAt || defaultLastInboundAt)(digits);
    if (!last) return false;
    const now = (deps.now || Date.now)();
    return now - last.getTime() <= WHATSAPP_WINDOW_MS - WINDOW_SAFETY_MARGIN_MS;
  } catch {
    return false;
  }
}
