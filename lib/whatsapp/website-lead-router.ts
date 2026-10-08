import { normalizePhoneNumber } from "@/lib/utils/phone";

/**
 * Website lead router (Week 5 integration with ritumbhara.com).
 *
 * The OS webhook stays the only Twilio entry point for the shared WhatsApp number. A message from someone who
 * is neither a team member nor a known guest gets no reply from the OS today (see handleGuestAIChat). This
 * module forwards exactly those messages to the website's lead-qualification bot and hands its TwiML reply
 * back to Twilio, so website leads are qualified on the same number.
 *
 * - OFF unless WEBSITE_LEAD_BOT_URL is set: the OS then behaves exactly as before.
 * - Staff and guests are never forwarded. "Known" uses the same rule as handleGuestAIChat (any Guest or
 *   TeamMember whose normalized phone matches), so everyone the OS AI answers today is still answered by it.
 * - The original raw body and X-Twilio-Signature are forwarded unchanged. The website verifies the signature
 *   against the OS webhook URL, so no new shared secret is needed and forged requests are rejected there.
 * - Any failure (timeout, error, unexpected reply) returns null, and the caller continues with the normal OS
 *   flow, which for an unknown sender means no reply: the same as before this change.
 */

export const WEBSITE_LEAD_BOT_TIMEOUT_MS = 10000; // Twilio waits ~15 s for the webhook response
export const WEBSITE_LEAD_BOT_ENTITY = "WEBSITE_LEAD_BOT"; // WhatsAppMessage.relatedEntityType for bot replies
const MAX_REPLY_BYTES = 64 * 1024;

export interface KnownContactPhones {
  guestPhones: (string | null | undefined)[];
  teamPhones: (string | null | undefined)[];
}

export interface LeadRouterDeps {
  botUrl: string | undefined;
  isKnownContact: (senderPhone: string) => Promise<boolean>;
  logOutbound: (toPhone: string, text: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: (event: string, meta?: Record<string, string | number | boolean>) => void;
}

export interface LeadRouterInput {
  senderPhone: string; // "From" without the "whatsapp:" prefix
  rawBody: string; // the exact form-encoded body Twilio sent
  signature: string | null; // X-Twilio-Signature header
}

// True when the phone belongs to any guest or team member (same matching as handleGuestAIChat).
export function isKnownPhone(senderPhone: string, phones: KnownContactPhones): boolean {
  const target = normalizePhoneNumber(senderPhone);
  if (!target) return false;
  const matches = (p: string | null | undefined) => !!p && normalizePhoneNumber(p) === target;
  return phones.guestPhones.some(matches) || phones.teamPhones.some(matches);
}

// The website bot URL, only if it is a valid https URL.
export function websiteBotUrl(value: string | undefined): string | null {
  const url = (value || "").trim();
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Plain texts of the <Message> elements in a TwiML document.
export function twimlMessageTexts(twiml: string): string[] {
  const texts: string[] = [];
  const re = /<Message(?:\s[^>]*)?>([\s\S]*?)<\/Message>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(twiml)) !== null) {
    const text = unescapeXml(m[1]).trim();
    if (text) texts.push(text);
  }
  return texts;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? "***" + digits.slice(-4) : "***";
}

const defaultLog: NonNullable<LeadRouterDeps["log"]> = (event, meta) => {
  console.warn("[website-lead-router] " + event + (meta ? " " + JSON.stringify(meta) : ""));
};

/**
 * Returns the TwiML to send back to Twilio when the message was handled by the website bot, or null when the
 * normal OS flow should continue (feature off, sender is staff/guest, or anything went wrong).
 */
export async function routeToWebsiteLeadBot(input: LeadRouterInput, deps: LeadRouterDeps): Promise<string | null> {
  const url = websiteBotUrl(deps.botUrl);
  if (!url) return null;

  const log = deps.log || defaultLog;
  const meta = { from: maskPhone(input.senderPhone) };

  try {
    if (await deps.isKnownContact(input.senderPhone)) return null;
  } catch {
    log("contact_lookup_failed", meta);
    return null;
  }

  if (!input.signature) {
    log("missing_signature", meta);
    return null;
  }

  const fetchImpl = deps.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || WEBSITE_LEAD_BOT_TIMEOUT_MS);
  let twiml: string;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": input.signature,
      },
      body: input.rawBody,
      redirect: "manual", // the configured URL must be exact; a redirect would change what the signature covers
      signal: controller.signal,
      cache: "no-store",
    });
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (res.status !== 200 || contentType.indexOf("xml") === -1) {
      log("bot_rejected", Object.assign({ status: res.status }, meta));
      return null;
    }
    twiml = await res.text();
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    log("bot_unreachable", Object.assign({ reason: reason }, meta));
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (twiml.length > MAX_REPLY_BYTES || twiml.indexOf("<Response") === -1) {
    log("bot_bad_reply", meta);
    return null;
  }

  // Keep the dashboard inbox complete: log what the bot said. A logging failure never blocks the reply.
  for (const text of twimlMessageTexts(twiml)) {
    try {
      await deps.logOutbound(input.senderPhone, text);
    } catch {
      log("outbound_log_failed", meta);
    }
  }

  log("bot_replied", meta);
  return twiml;
}

// Production dependencies: environment + Prisma (imported lazily so this module stays testable without a DB).
export function defaultLeadRouterDeps(): LeadRouterDeps {
  return {
    botUrl: process.env.WEBSITE_LEAD_BOT_URL,
    isKnownContact: async (senderPhone) => {
      const { prisma } = await import("@/lib/prisma");
      const [guests, team] = await Promise.all([
        prisma.guest.findMany({ select: { phone: true } }),
        prisma.teamMember.findMany({ select: { whatsappNumber: true } }),
      ]);
      return isKnownPhone(senderPhone, {
        guestPhones: guests.map((g) => g.phone),
        teamPhones: team.map((t) => t.whatsappNumber),
      });
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
          relatedEntityType: WEBSITE_LEAD_BOT_ENTITY,
        },
      });
    },
  };
}
