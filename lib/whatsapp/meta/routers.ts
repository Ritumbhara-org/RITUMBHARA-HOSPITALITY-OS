import { createHmac } from "node:crypto";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { guestAskUrl, isGuestStayTopic, GUEST_MESSAGES_MAX_WAIT_MS } from "@/lib/whatsapp/guest-messages-router";
import { websiteBotUrl } from "@/lib/whatsapp/website-lead-router";

// Meta versions of the two website routers. The Twilio routers (guest-messages-router.ts, website-lead-router.ts)
// are unchanged; these run only for messages that arrived on the Meta number, AFTER the Meta webhook verified the
// X-Hub-Signature-256. There is no TwiML: each returns plain reply text(s) and the caller sends them through Meta.

const MIN_SECRET_LENGTH = 32;
const MAX_QUESTION_LENGTH = 500;
export const META_LEAD_BOT_TIMEOUT_MS = 15000;

type Log = (event: string, meta?: Record<string, string | number | boolean>) => void;
const defaultLog = (prefix: string): Log => (event, meta) => console.warn(`[${prefix}] ` + event + (meta ? " " + JSON.stringify(meta) : ""));

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length > 4 ? "***" + d.slice(-4) : "***";
}

export interface MetaRoutedMessage {
  senderPhone: string; // "+<digits>"
  text: string;
  messageId: string; // wamid
  profileName?: string | null;
  numMedia?: number;
}

// ---------- Guest Messages (website /api/guest-messages/ask) ----------

export interface MetaGuestMessagesDeps {
  askUrl: string | undefined; // GUEST_MESSAGES_ASK_URL (same as the Twilio path)
  apiSecret: string | undefined; // GUEST_MESSAGES_API_SECRET (same as the Twilio path)
  isKnownContact: (senderPhone: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  maxWaitMs?: number;
  log?: Log;
}

// The verified website reply for an unknown sender's stay question, or null to continue with the normal flow.
// Same rules as the Twilio router: stay topics only, unknown senders only, verified booking only.
export async function askGuestMessagesForMeta(input: MetaRoutedMessage, deps: MetaGuestMessagesDeps): Promise<string | null> {
  const askUrl = guestAskUrl(deps.askUrl);
  const secret = (deps.apiSecret || "").trim();
  if (!askUrl || secret.length < MIN_SECRET_LENGTH) return null;
  if (!isGuestStayTopic(input.text)) return null;
  const phone = normalizePhoneNumber(input.senderPhone);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  const log = deps.log || defaultLog("meta-guest-messages");
  const meta = { from: maskPhone(phone) };
  try {
    if (await deps.isKnownContact(phone)) return null;
  } catch {
    log("contact_lookup_failed", meta);
    return null;
  }
  const payload: Record<string, unknown> = {
    question: input.text.trim().slice(0, MAX_QUESTION_LENGTH),
    phone,
    channel: "whatsapp",
    requireBooking: true,
  };
  if (/^[A-Za-z0-9_.=:-]{6,128}$/.test(input.messageId)) payload.messageId = input.messageId.slice(0, 64).replace(/[^A-Za-z0-9_-]/g, "_");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.maxWaitMs || GUEST_MESSAGES_MAX_WAIT_MS);
  let reply: any;
  try {
    const res = await (deps.fetchImpl || fetch)(askUrl, {
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
    log(err instanceof Error && err.name === "AbortError" ? "ask_timeout" : "ask_unreachable", meta);
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!reply || reply.ok !== true || reply.outcome === "not_guest") return null;
  if (reply.bookingVerified !== true || (reply.outcome !== "answered" && reply.outcome !== "escalated")) return null;
  const text = typeof reply.reply === "string" ? reply.reply.trim() : "";
  if (!text || text.length > 1600) return null;
  log("guest_" + reply.outcome, meta);
  return text;
}

// ---------- Website lead bot (website /api/whatsapp/lead-bot, JSON + HMAC) ----------

export interface MetaLeadBotDeps {
  botUrl: string | undefined; // WEBSITE_LEAD_BOT_META_URL, e.g. https://www.ritumbhara.com/api/whatsapp/lead-bot
  secret: string | undefined; // LEAD_BOT_OS_SECRET (same value on the website)
  isKnownContact: (senderPhone: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  log?: Log;
}

// Signature the website checks: "t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + body)>".
export function signLeadBotRequest(secret: string, body: string, unixSeconds: number): string {
  return "t=" + unixSeconds + ",v1=" + createHmac("sha256", secret).update(unixSeconds + "." + body, "utf8").digest("hex");
}

// The bot's reply texts (possibly empty: handled, nothing to say), or null to continue with the OS AI.
export async function forwardToWebsiteLeadBotForMeta(input: MetaRoutedMessage, deps: MetaLeadBotDeps): Promise<string[] | null> {
  const url = websiteBotUrl(deps.botUrl);
  const secret = (deps.secret || "").trim();
  if (!url || secret.length < MIN_SECRET_LENGTH) return null;
  const log = deps.log || defaultLog("meta-lead-bot");
  const meta = { from: maskPhone(input.senderPhone) };
  try {
    if (await deps.isKnownContact(input.senderPhone)) return null;
  } catch {
    log("contact_lookup_failed", meta);
    return null;
  }
  const body = JSON.stringify({
    messageId: input.messageId,
    from: input.senderPhone,
    text: input.text,
    numMedia: input.numMedia || 0,
    profileName: input.profileName || null,
  });
  const ts = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || META_LEAD_BOT_TIMEOUT_MS);
  let data: any;
  try {
    const res = await (deps.fetchImpl || fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ritumbhara-Signature": signLeadBotRequest(secret, body, ts) },
      body,
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status !== 200) {
      log("bot_rejected", Object.assign({ status: res.status }, meta));
      return null;
    }
    data = JSON.parse(await res.text());
  } catch (err) {
    log(err instanceof Error && err.name === "AbortError" ? "bot_timeout" : "bot_unreachable", meta);
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!data || data.ok !== true) {
    log("bot_bad_reply", meta);
    return null;
  }
  const replies = (Array.isArray(data.replies) ? data.replies : [])
    .filter((r: unknown) => typeof r === "string" && r.trim())
    .map((r: string) => r.slice(0, 4096));
  log("bot_replied", meta);
  return replies;
}
