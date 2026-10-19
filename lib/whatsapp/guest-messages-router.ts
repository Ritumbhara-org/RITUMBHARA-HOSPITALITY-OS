import { normalizePhoneNumber } from "@/lib/utils/phone";

/**
 * Week 7 Guest Messages router (integration with ritumbhara.com /api/guest-messages/ask).
 *
 * Problem it solves: a guest booked through Intellistay whose phone is not an OS guest profile is, for the OS, an
 * unknown sender, so "can I extend my stay?" went to the website's LEAD bot as if it were a new enquiry.
 *
 * What it does, for one inbound WhatsApp message, before the website lead bot:
 *   1. OFF unless GUEST_MESSAGES_ASK_URL, GUEST_MESSAGES_API_SECRET, TWILIO_WEBHOOK_URL and TWILIO_AUTH_TOKEN are set.
 *   2. Only messages about the stay itself: extension, early check-in / late checkout, cancellation, date changes,
 *      refunds, check-in / checkout times (a narrow keyword check; the real classification stays on the website).
 *   3. Only senders the OS does NOT know (not a team member, not a guest profile). Known guests keep the existing
 *      OS AI + ticket flow, and staff keep their commands: exactly as before.
 *   4. Only requests that really come from Twilio (X-Twilio-Signature verified with TWILIO_AUTH_TOKEN), because the
 *      next step can file an escalation and email the team.
 *   5. Asks the website with requireBooking: true. The website answers or escalates ONLY when the phone matches a
 *      current Intellistay (TEST) booking; otherwise it returns "not_guest" and stores nothing.
 *   6. A verified answer/escalation reply is returned as TwiML (the guest's reply to their own message). A timeout
 *      returns empty TwiML: the website may still escalate, so the lead bot must not answer the same message.
 *      Anything else (not a guest, website down, unexpected reply) returns null and the caller continues with the
 *      unchanged flow (website lead bot, then the OS AI).
 *
 * It never sends a proactive WhatsApp message, never changes a booking, and never calls Intellistay itself.
 */

export const GUEST_MESSAGES_ROUTER_TIMEOUT_MS = 4000; // keeps room in Twilio's ~15 s; a timeout ends the flow (empty TwiML)
export const GUEST_MESSAGES_ENTITY = "GUEST_MESSAGES"; // WhatsAppMessage.relatedEntityType for these replies
const MIN_SECRET_LENGTH = 32;
const MAX_QUESTION_LENGTH = 500;

// Messages about an existing stay. Deliberately narrow: anything else keeps the old routing.
const STAY_TOPIC = new RegExp(
  [
    "\\bextend\\w*", "\\bextension\\b", "\\b(extra|one more|another|additional) nights?\\b", "\\bstay (longer|more|extra)\\b",
    "\\bearly check ?in\\b", "\\bcheck ?in early\\b", "\\blate check ?out\\b", "\\bcheck ?out late\\b",
    "\\bcancel\\w*", "\\breschedul\\w*", "\\bpostpone\\w*", "\\bprepone\\w*", "\\brefund\\w*",
    "\\b(change|modify|shift|move)\\b.{0,25}\\b(booking|reservation|dates?|stay)\\b",
    "\\bcheck ?(in|out) time\\b", "\\bwhat time\\b.{0,30}\\bcheck ?(in|out)\\b", "\\bwhen (can|do|should) (i|we)\\b.{0,20}\\bcheck ?(in|out)\\b",
  ].join("|"),
  "i"
);

export function isGuestStayTopic(text: string): boolean {
  const q = (text || "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  return STAY_TOPIC.test(q);
}

// The website's /api/guest-messages/ask URL, only if it is https and points at that route.
export function guestAskUrl(value: string | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.pathname === "/api/guest-messages/ask" && !url.search ? url.toString() : null;
  } catch {
    return null;
  }
}

function httpsUrl(value: string | undefined): string | null {
  const raw = (value || "").trim();
  try {
    return raw && new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? "***" + digits.slice(-4) : "***";
}

export interface GuestMessagesRouterDeps {
  askUrl: string | undefined; // GUEST_MESSAGES_ASK_URL
  apiSecret: string | undefined; // GUEST_MESSAGES_API_SECRET (same value as on the website)
  webhookUrl: string | undefined; // TWILIO_WEBHOOK_URL: the exact public URL Twilio calls for this webhook
  authToken: string | undefined; // TWILIO_AUTH_TOKEN
  isKnownContact: (senderPhone: string) => Promise<boolean>;
  validateSignature: (authToken: string, signature: string, url: string, params: Record<string, string>) => boolean | Promise<boolean>;
  logOutbound: (toPhone: string, text: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: (event: string, meta?: Record<string, string | number | boolean>) => void;
}

export interface GuestMessagesRouterInput {
  senderPhone: string; // "From" without the "whatsapp:" prefix
  text: string; // the message text
  rawBody: string; // the exact form-encoded body Twilio sent
  signature: string | null; // X-Twilio-Signature header
}

const defaultLog: NonNullable<GuestMessagesRouterDeps["log"]> = (event, meta) => {
  console.warn("[guest-messages-router] " + event + (meta ? " " + JSON.stringify(meta) : ""));
};

/**
 * Returns TwiML with the website's reply when a verified guest's stay question was answered or escalated, empty
 * TwiML when the website did not answer in time, or null when the caller should continue with the normal flow.
 */
export async function routeToGuestMessages(input: GuestMessagesRouterInput, deps: GuestMessagesRouterDeps): Promise<string | null> {
  const askUrl = guestAskUrl(deps.askUrl);
  const secret = (deps.apiSecret || "").trim();
  const webhookUrl = httpsUrl(deps.webhookUrl);
  const authToken = (deps.authToken || "").trim();
  if (!askUrl || secret.length < MIN_SECRET_LENGTH || !webhookUrl || !authToken) return null;

  if (!isGuestStayTopic(input.text)) return null;

  const phone = normalizePhoneNumber(input.senderPhone);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;

  const log = deps.log || defaultLog;
  const meta = { from: maskPhone(phone) };

  try {
    if (await deps.isKnownContact(phone)) return null; // OS guests and staff: unchanged flow
  } catch {
    log("contact_lookup_failed", meta);
    return null;
  }

  const params = new URLSearchParams(input.rawBody);
  let signed = false;
  if (input.signature) {
    try {
      signed = await deps.validateSignature(authToken, input.signature, webhookUrl, Object.fromEntries(params.entries()));
    } catch {
      signed = false;
    }
  }
  if (!signed) {
    log("signature_rejected", meta);
    return null;
  }

  const messageSid = params.get("MessageSid") || "";
  const payload: Record<string, unknown> = {
    question: input.text.trim().slice(0, MAX_QUESTION_LENGTH),
    phone,
    channel: "whatsapp",
    requireBooking: true,
  };
  if (/^[A-Za-z0-9_-]{6,64}$/.test(messageSid)) payload.messageId = messageSid; // makes Twilio retries idempotent

  const fetchImpl = deps.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || GUEST_MESSAGES_ROUTER_TIMEOUT_MS);
  let reply: { ok?: unknown; outcome?: unknown; bookingVerified?: unknown; reply?: unknown; reason?: unknown };
  try {
    const res = await fetchImpl(askUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status !== 200) {
      log("ask_rejected", Object.assign({ status: res.status }, meta));
      return null;
    }
    reply = JSON.parse(await res.text());
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // The verified request already reached the website, which keeps working after we stop waiting and may still
      // escalate to the team. Falling through would also let the lead bot answer the same stay question, so reply
      // with empty TwiML instead (no WhatsApp message) and let the website's escalation stand.
      log("ask_timeout_suppressed", meta);
      return "<Response></Response>";
    }
    log("ask_unreachable", Object.assign({ reason: "network" }, meta));
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!reply || typeof reply !== "object" || reply.ok !== true) return null;
  if (reply.outcome === "not_guest") {
    log("not_a_guest", meta);
    return null;
  }
  // Only a reply for a VERIFIED booking is used (an older website version without requireBooking never sets this).
  if (reply.bookingVerified !== true || (reply.outcome !== "answered" && reply.outcome !== "escalated")) return null;
  const text = typeof reply.reply === "string" ? reply.reply.trim() : "";
  if (!text || text.length > 1600) return null;

  try {
    await deps.logOutbound(phone, text); // keep the Unified Inbox complete; never blocks the reply
  } catch {
    log("outbound_log_failed", meta);
  }
  log("guest_" + String(reply.outcome), Object.assign({ reason: typeof reply.reason === "string" ? reply.reason : "" }, meta));
  return "<Response><Message>" + escapeXml(text) + "</Message></Response>";
}

// Production dependencies: environment + Prisma + Twilio (imported lazily so this module stays testable without them).
export function defaultGuestMessagesRouterDeps(): GuestMessagesRouterDeps {
  return {
    askUrl: process.env.GUEST_MESSAGES_ASK_URL,
    apiSecret: process.env.GUEST_MESSAGES_API_SECRET,
    webhookUrl: process.env.TWILIO_WEBHOOK_URL,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    isKnownContact: async (senderPhone) => {
      const { prisma } = await import("@/lib/prisma");
      const [guests, team] = await Promise.all([
        prisma.guest.findMany({ select: { phone: true } }),
        prisma.teamMember.findMany({ select: { whatsappNumber: true } }),
      ]);
      const target = normalizePhoneNumber(senderPhone);
      const same = (p: string | null | undefined) => !!p && normalizePhoneNumber(p) === target;
      return guests.some((g: { phone: string | null }) => same(g.phone)) || team.some((t: { whatsappNumber: string | null }) => same(t.whatsappNumber));
    },
    validateSignature: async (authToken, signature, url, params) => {
      const twilio = (await import("twilio")).default;
      return twilio.validateRequest(authToken, signature, url, params);
    },
    logOutbound: async (toPhone, text) => {
      const { prisma } = await import("@/lib/prisma");
      await prisma.whatsAppMessage.create({
        data: {
          direction: "OUTBOUND",
          from: process.env.TWILIO_WHATSAPP_NUMBER || "SYSTEM",
          to: toPhone,
          messageType: "text",
          content: text,
          status: "DELIVERED", // same convention as the webhook's own TwiML replies
          relatedEntityType: GUEST_MESSAGES_ENTITY,
        },
      });
    },
  };
}
