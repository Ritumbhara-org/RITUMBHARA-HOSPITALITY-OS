// Turns an inbound email (forwarded OTA notification or a guest's direct email)
// into a normalized inbox message. Pure functions only, so they are easy to test.
//
// Accepted payload shapes:
//  - generic JSON: { from, to, subject, text, html, replyTo, messageId, inReplyTo }
//  - Postmark inbound JSON: { From, FromFull, To, Subject, TextBody, HtmlBody, ReplyTo, MessageID, Headers[] }
//  - SendGrid Inbound Parse form fields: from, to, subject, text, html, headers (raw header block)
//
// OTA email formats change often and differ by locale, so the name / code
// extraction is best-effort. The raw payload is always stored with the message.

import type { InboxChannelId } from "./channels";

export interface ParsedInboundEmail {
  channel: InboxChannelId;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  subject: string;
  body: string;
  messageId: string | null;
  inReplyTo: string | null;
  guestName: string | null;
  reservationCode: string | null;
  /** Stable key used to group messages from the same guest conversation. */
  threadKey: string;
}

type Dict = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** "Rahul Sharma <rahul@x.com>" -> { name: "Rahul Sharma", email: "rahul@x.com" } */
export function parseAddress(raw: string): { name: string | null; email: string } {
  const value = raw.trim();
  const angle = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (angle) {
    const name = angle[1].trim();
    return { name: name || null, email: angle[2].trim().toLowerCase() };
  }
  const bare = value.match(/[^\s<>,;]+@[^\s<>,;]+/);
  return { name: null, email: (bare ? bare[0] : value).toLowerCase() };
}

function headerFromRawBlock(block: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, "im");
  const m = block.match(re);
  return m ? m[1].replace(/\r?\n[ \t]+/g, " ").trim() : "";
}

function headerFromList(headers: unknown, name: string): string {
  if (!Array.isArray(headers)) return "";
  const hit = headers.find((h) => str((h as Dict)?.Name).toLowerCase() === name.toLowerCase());
  return hit ? str((hit as Dict).Value) : "";
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CUT_MARKERS: RegExp[] = [
  /^\s*on .{4,200}wrote:\s*$/im,
  /^\s*-{2,}\s*original message\s*-{2,}/im,
  /^\s*#+\s*please type your reply above this line\s*#+/im,
  /^\s*reply above this line/im,
  /^\s*-- ?$/m,
  /^\s*sent from my (iphone|android|phone|mobile)/im,
  /^\s*_{5,}\s*$/m,
  /^\s*from:\s.+$/im,
  /^\s*(respond|reply) (to|on) (airbnb|booking\.com|agoda)/im,
  /^\s*this (e-?mail|message) was sent (to you )?by/im,
];

/** Keeps only the new part of the message: drops quoted history, signatures and footers. */
export function cleanBody(text: string): string {
  let body = text.replace(/\r\n/g, "\n");
  for (const marker of CUT_MARKERS) {
    const m = body.match(marker);
    if (m && m.index !== undefined && m.index > 0) body = body.slice(0, m.index);
  }
  body = body
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return body.length > 4000 ? body.slice(0, 4000) + "…" : body;
}

export function detectChannel(addresses: string[]): InboxChannelId {
  const all = addresses.join(" ").toLowerCase();
  if (/airbnb\./.test(all)) return "AIRBNB";
  if (/booking\.com/.test(all)) return "BOOKING_COM";
  if (/agoda[.-]/.test(all)) return "AGODA";
  if (/expedia/.test(all)) return "EXPEDIA";
  return "EMAIL";
}

const NAME = "([A-Z\\u00C0-\\u024F][\\p{L}.'-]+(?:\\s+[A-Z\\u00C0-\\u024F][\\p{L}.'-]+){0,3})";

export function extractGuestName(subject: string, fromName: string | null, channel: InboxChannelId): string | null {
  if (fromName) {
    const via = fromName.match(/^(.+?)\s+(?:via|from|\()\s*(?:airbnb|booking\.com|agoda|expedia)/i);
    if (via) return via[1].trim();
    if (channel === "EMAIL") return fromName;
  }
  const patterns = [
    new RegExp(`(?:message|reply|inquiry|enquiry|request) from (?:guest\\s+)?${NAME}`, "u"),
    new RegExp(`${NAME} (?:sent you a message|has sent you a message|messaged you|replied|wrote)`, "u"),
    new RegExp(`(?:from guest|guest)[:\\s]+${NAME}`, "u"),
  ];
  for (const p of patterns) {
    const m = subject.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

export function extractReservationCode(text: string, channel: InboxChannelId): string | null {
  if (channel === "AIRBNB") {
    const m = text.match(/\bHM[A-Z0-9]{8}\b/);
    if (m) return m[0];
  }
  const labelled = text.match(
    /(?:confirmation|booking|reservation)\s*(?:number|no\.?|code|id|#)\s*[:#]?\s*([A-Z0-9-]{6,14})\b/i
  );
  if (labelled && /\d/.test(labelled[1])) return labelled[1].toUpperCase();
  return null;
}

/**
 * Manually forwarded emails ("---------- Forwarded message ---------") hide the real
 * sender inside the body. Pull the original From / Reply-To / Subject and the inner text out.
 */
export function unwrapForward(text: string): { inner: string; from?: string; replyTo?: string; subject?: string } | null {
  const marker = text.match(/^[ \t]*-{3,}\s*(?:forwarded message|original message|begin forwarded message)\s*-{0,}\s*:?\s*$/im);
  if (!marker || marker.index === undefined) return null;
  const after = text.slice(marker.index + marker[0].length).replace(/^\s*\n/, "");
  const lines = after.split(/\r?\n/);
  const meta: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(from|reply-to|subject|date|to|cc|sent)\s*:\s*(.*)$/i);
    if (!m) break;
    meta[m[1].toLowerCase()] = m[2].trim();
  }
  if (!meta.from) return null;
  return { inner: lines.slice(i).join("\n").trim(), from: meta.from, replyTo: meta["reply-to"], subject: meta.subject };
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "").trim().toLowerCase();
}

export function parseInboundEmail(payload: Dict): ParsedInboundEmail {
  const headersRaw = str(payload.headers);
  let fromRaw = str(payload.from) || str(payload.From);
  const fromFull = payload.FromFull as Dict | undefined;
  let from = fromFull?.Email
    ? { name: str(fromFull.Name) || null, email: str(fromFull.Email).toLowerCase() }
    : parseAddress(fromRaw);

  const toRaw = str(payload.to) || str(payload.To);
  let replyToRaw =
    str(payload.replyTo) || str(payload.ReplyTo) || headerFromRawBlock(headersRaw, "Reply-To") || headerFromList(payload.Headers, "Reply-To");

  let subject = (str(payload.subject) || str(payload.Subject)).trim();
  let text = str(payload.text) || str(payload.TextBody);
  const html = str(payload.html) || str(payload.HtmlBody);
  if (!text && html) text = htmlToText(html);

  const forwarded = unwrapForward(text);
  if (forwarded) {
    fromRaw = forwarded.from || fromRaw;
    from = parseAddress(fromRaw);
    // A manual forward's Reply-To points at the forwarder, so only trust the inner one.
    replyToRaw = forwarded.replyTo || "";
    subject = forwarded.subject || subject;
    text = forwarded.inner;
  }

  const replyTo = replyToRaw ? parseAddress(replyToRaw).email : null;
  const body = cleanBody(text);

  const messageId =
    str(payload.messageId) || str(payload.MessageID) || headerFromRawBlock(headersRaw, "Message-ID") || headerFromList(payload.Headers, "Message-ID") || null;
  const inReplyTo =
    str(payload.inReplyTo) || headerFromRawBlock(headersRaw, "In-Reply-To") || headerFromList(payload.Headers, "In-Reply-To") || null;

  const channel = detectChannel([from.email, replyTo || "", toRaw, fromRaw]);
  const guestName = extractGuestName(subject, from.name, channel);
  const reservationCode = extractReservationCode(`${subject}\n${text}`, channel);

  // Group by reservation code first, then the OTA relay address (one per guest thread), then sender + subject.
  const threadKey = reservationCode
    ? `res:${reservationCode}`
    : replyTo && channel !== "EMAIL"
      ? `relay:${replyTo}`
      : `mail:${channel === "EMAIL" ? from.email : replyTo || from.email}:${channel === "EMAIL" ? "" : normalizeSubject(subject)}`;

  return {
    channel,
    fromEmail: from.email,
    fromName: from.name,
    replyTo: replyTo || (channel === "EMAIL" ? from.email : null),
    subject,
    body,
    messageId: messageId ? messageId.replace(/^<|>$/g, "") : null,
    inReplyTo: inReplyTo ? inReplyTo.replace(/^<|>$/g, "") : null,
    guestName,
    reservationCode,
    threadKey,
  };
}
