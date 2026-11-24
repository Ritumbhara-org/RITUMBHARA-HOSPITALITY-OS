import { after } from "next/server";
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
 *   6. A verified answer/escalation reply is returned as TwiML (the guest's reply to their own message).
 *      If the website has not answered within 4 s (its Intellistay TEST booking check can take ~6 s), Twilio gets
 *      empty TwiML right away (so the lead bot never answers a stay question the website is still handling) and the
 *      OS keeps waiting AFTER the response (Next after(), up to 25 s). If the website then returns a VERIFIED reply,
 *      that same reply is sent to the guest with the OS's Twilio sender (the reply to their own message, logged in
 *      the Unified Inbox). A late "not a guest", error or no answer sends nothing.
 *      Anything else (not a guest, website down, unexpected reply) returns null and the caller continues with the
 *      unchanged flow (website lead bot, then the OS AI).
 *
 * It never sends a proactive WhatsApp message, never changes a booking, and never calls Intellistay itself.
 */

export const GUEST_MESSAGES_ROUTER_TIMEOUT_MS = 4000; // TwiML reply budget; slower verified replies are sent after the response
export const GUEST_MESSAGES_MAX_WAIT_MS = 25000; // hard limit for the website call, including the after-response wait
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
  // Late replies (website slower than timeoutMs): keep work running after the webhook response, and send the reply.
  // Without both, a slow website ends the flow with empty TwiML and nothing is sent (the previous behaviour).
  defer?: (task: Promise<void>) => void;
  sendReply?: (toPhone: string, text: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxWaitMs?: number;
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
  const fastMs = deps.timeoutMs || GUEST_MESSAGES_ROUTER_TIMEOUT_MS;
  const canSendLate = !!deps.defer && !!deps.sendReply;
  // Without a late sender, the call is cut at the TwiML budget exactly as before; with one, it may run to the hard limit.
  const hardMs = canSendLate ? Math.max(deps.maxWaitMs || GUEST_MESSAGES_MAX_WAIT_MS, fastMs) : fastMs;
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(), hardMs);

  // The website call. Never rejects: resolves to the verified reply to send, or the reason there is none.
  type AskResult = { kind: "reply"; text: string; outcome: string; reason: string } | { kind: "none"; event: string; status?: number };
  const pending: Promise<AskResult> = (async (): Promise<AskResult> => {
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
      if (res.status !== 200) return { kind: "none", event: "ask_rejected", status: res.status };
      reply = JSON.parse(await res.text());
    } catch (err) {
      return { kind: "none", event: err instanceof Error && err.name === "AbortError" ? "ask_timeout" : "ask_unreachable" };
    } finally {
      clearTimeout(hardTimer);
    }
    if (!reply || typeof reply !== "object" || reply.ok !== true) return { kind: "none", event: "ask_bad_reply" };
    if (reply.outcome === "not_guest") return { kind: "none", event: "not_a_guest" };
    // Only a reply for a VERIFIED booking is used (an older website version without requireBooking never sets this).
    if (reply.bookingVerified !== true || (reply.outcome !== "answered" && reply.outcome !== "escalated")) return { kind: "none", event: "ask_unverified" };
    const text = typeof reply.reply === "string" ? reply.reply.trim() : "";
    if (!text || text.length > 1600) return { kind: "none", event: "ask_bad_reply" };
    return { kind: "reply", text, outcome: String(reply.outcome), reason: typeof reply.reason === "string" ? reply.reason : "" };
  })();

  // Wait at most the TwiML budget for the answer.
  let fastTimer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<"slow">((resolve) => { fastTimer = setTimeout(() => resolve("slow"), fastMs); });
  const first = await Promise.race([pending, slow]);
  clearTimeout(fastTimer);

  if (first !== "slow" && !(first.kind === "none" && first.event === "ask_timeout")) {
    // Fast path: unchanged behaviour.
    if (first.kind === "none") {
      if (first.event === "ask_rejected") log("ask_rejected", Object.assign({ status: first.status || 0 }, meta));
      else if (first.event === "ask_unreachable") log("ask_unreachable", Object.assign({ reason: "network" }, meta));
      else if (first.event === "not_a_guest") log("not_a_guest", meta);
      return null; // the caller continues with the lead bot / OS AI
    }
    try {
      await deps.logOutbound(phone, first.text); // keep the Unified Inbox complete; never blocks the reply
    } catch {
      log("outbound_log_failed", meta);
    }
    log("guest_" + first.outcome, Object.assign({ reason: first.reason }, meta));
    return "<Response><Message>" + escapeXml(first.text) + "</Message></Response>";
  }

  // Slower than the TwiML budget. The verified request already reached the website, which keeps working and may still
  // escalate to the team, so the lead bot must not answer this stay question: Twilio gets empty TwiML now.
  if (!canSendLate) {
    controller.abort();
    log("ask_timeout_suppressed", meta);
    return "<Response></Response>";
  }
  const sendReply = deps.sendReply as NonNullable<GuestMessagesRouterDeps["sendReply"]>;
  log("ask_reply_deferred", meta);
  (deps.defer as NonNullable<GuestMessagesRouterDeps["defer"]>)(
    pending
      .then(async (late) => {
        if (late.kind === "none") {
          log("late_" + late.event, meta); // nothing is sent: not a guest, error, or no answer within the hard limit
          return;
        }
        let sent = false;
        try {
          sent = await sendReply(phone, late.text); // the sender logs the message in the Unified Inbox itself
        } catch {
          sent = false;
        }
        log(sent ? "guest_" + late.outcome + "_sent_late" : "late_reply_send_failed", Object.assign({ reason: late.reason }, meta));
      })
      .catch(() => { /* never surfaces: the guest simply gets no late reply */ })
  );
  return "<Response></Response>";
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
    // Keeps the late-reply task alive after the webhook has answered Twilio (Next.js after()).
    defer: (task) => { after(task); },
    // A late reply goes out through the OS's existing Twilio sender, which also logs it in the Unified Inbox.
    sendReply: async (toPhone, text) => {
      const { sendWhatsAppMessage } = await import("@/lib/whatsapp/client");
      const r = await sendWhatsAppMessage(toPhone, "text", text, undefined, GUEST_MESSAGES_ENTITY);
      return r.success;
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
