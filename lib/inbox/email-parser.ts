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
  /** Account / marketing notice with no guest conversation (login codes, co-host invites…): don't store. */
  ignore: boolean;
  /** When the email was received, if the sender said (Gmail bridge `date`, Postmark `Date`). */
  receivedAt: Date | null;
}

type Dict = Record<string, unknown>;

/** Accepts a sane past date only: a missing, invalid or future value falls back to "now". */
function parseReceivedAt(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60 * 1000) return null;
  return d;
}

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
  let last: string | null = null;
  // The header block runs until the first blank line. Gmail wraps long values
  // (e.g. a long Subject) onto the next line, so non-header lines continue the previous value.
  for (; i < lines.length; i++) {
    if (!lines[i].trim()) {
      i++;
      break;
    }
    const m = lines[i].match(/^\s*(from|reply-to|subject|date|to|cc|sent)\s*:\s*(.*)$/i);
    if (m) {
      last = m[1].toLowerCase();
      meta[last] = m[2].trim();
    } else if (last) {
      meta[last] = `${meta[last]} ${lines[i].trim()}`.trim();
    } else {
      break;
    }
  }
  if (!meta.from) return null;
  return { inner: lines.slice(i).join("\n").trim(), from: meta.from, replyTo: meta["reply-to"], subject: meta.subject };
}

/** Drops image placeholders and bare tracking links that plain-text OTA emails are full of. */
export function stripNoise(text: string): string {
  return text
    .replace(/\[image:[^\]]*\]/g, "")
    .replace(/<https?:\/\/[^>\s]*>/g, "")
    .replace(/\[https?:\/\/[^\]\s]*\]/g, "")
    .replace(/%opentrack%/gi, "")
    // Lines that are nothing but links.
    .replace(/^[ \t]*https?:\/\/\S+(?:[ \t]+https?:\/\/\S+)*[ \t]*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

const AIRBNB_ROLE = /^(booker|guest|co-?host|host|cohost)$/i;

function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * Airbnb "new message" digest emails list each message as three paragraphs:
 * NAME / role (Booker, Co-host, …) / text, between the "always communicate through Airbnb"
 * line and the "Reply" button.
 */
export function parseAirbnbDigest(text: string): { guestName: string | null; message: string | null } | null {
  const start = text.match(/always communicate through airbnb\.?[^\n]*\n/i);
  if (!start || start.index === undefined) return null;
  let section = text.slice(start.index + start[0].length);
  const end = section.match(/^\s*(?:reply|you can also respond by replying)/im);
  if (end && end.index !== undefined) section = section.slice(0, end.index);

  const paras = section.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const entries: { name: string; role: string; text: string[] }[] = [];
  for (let i = 0; i < paras.length; i++) {
    const isHeader = !paras[i].includes("\n") && i + 1 < paras.length && AIRBNB_ROLE.test(paras[i + 1]);
    if (isHeader) {
      entries.push({ name: titleCase(paras[i]), role: paras[i + 1].toLowerCase(), text: [] });
      i++;
    } else if (entries.length) {
      entries[entries.length - 1].text.push(paras[i]);
    }
  }
  if (!entries.length) return null;

  const isTeam = (role: string) => /host/.test(role);
  const guest = entries.find((e) => !isTeam(e.role));
  const speakers = new Set(entries.map((e) => e.name));
  const lines = entries
    .filter((e) => e.text.length)
    .map((e) => {
      const said = e.text.join("\n");
      if (isTeam(e.role)) return `${e.name} (${e.role}): ${said}`;
      return speakers.size > 1 ? `${e.name}: ${said}` : said;
    });
  return { guestName: guest?.name ?? null, message: lines.join("\n") || null };
}

// Lines where the guest's own words stop in Airbnb notification emails.
const AIRBNB_END =
  /^\s*(pre-approve|accept|decline|reply|respond|send a message|translate|you have \d+ hours|frequently asked questions|customer support|get the airbnb app|airbnb ireland|for your protection|always communicate through airbnb)/im;

/**
 * Airbnb host emails ("Respond to Karan’s inquiry", "New message from Karan", "RE: Reservation at …")
 * carry the conversation id in their /hosting/thread/<id> links and the guest's text after the
 * "On Airbnb since 2026" / "Identity verified" profile lines.
 */
export function parseAirbnb(rawText: string): { threadId: string | null; guestName: string | null; message: string | null } {
  const threadId = rawText.match(/airbnb\.[a-z.]+\/hosting\/(?:thread|inbox\/thread)\/(\d+)/i)?.[1]
    ?? rawText.match(/airbnb\.[a-z.]+\/(?:messaging\/thread|z\/q)\/(\d+)/i)?.[1]
    ?? null;

  const text = stripNoise(rawText);
  const digest = parseAirbnbDigest(text);
  if (digest?.message) return { threadId, guestName: digest.guestName, message: digest.message };

  const NAME = "([\\p{L}][\\p{L}.'-]*(?:\\s+[\\p{L}][\\p{L}.'-]*){0,3})";
  const nameMatch =
    text.match(new RegExp(`(?:respond to|reply to)\\s+${NAME}[’']s\\s+(?:inquiry|request|message|booking)`, "iu")) ||
    text.match(new RegExp(`(?:new message from|message from)\\s+${NAME}`, "iu")) ||
    // "Send Madhusudan a MessageSend Madhusudan a Message": stop at the first "a Message".
    text.match(/send\s+([\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){0,3}?)\s+a\s+message/iu);
  const guestName = nameMatch ? nameMatch[1].trim() : null;

  let message: string | null = null;
  const profile = text.match(/^\s*(?:on airbnb since \d{4}|identity verified|\d+ reviews?)\s*$/im);
  if (profile && profile.index !== undefined) {
    let rest = text.slice(profile.index + profile[0].length);
    // Skip any further profile lines (reviews, verified, location).
    rest = rest.replace(/^(\s*(?:identity verified|\d+ reviews?|lives in .*|on airbnb since \d{4})\s*\n)+/i, "");
    // The guest's home town ("Jaipur, India") sits on its own line before the message.
    rest = rest.replace(/^\s*\p{Lu}[\p{L} .'-]*,\s*\p{Lu}[\p{L} .'-]*[ \t]*\n/u, "");
    const end = rest.match(AIRBNB_END);
    if (end && end.index !== undefined) rest = rest.slice(0, end.index);
    // "Send Muskan a Message" button: booking confirmations have no guest text, the listing follows it.
    const button = rest.match(/send\s+[\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){0,3}?\s+a\s+message/iu);
    if (button && button.index !== undefined) rest = rest.slice(0, button.index);
    message = rest.trim() || null;
  }
  return { threadId, guestName, message };
}

/**
 * Agoda guest-message emails ("Reply from X (dates)", "New inquiry from X") come from
 * notifications@agoda-messaging.com, carry a conversationId in every link, and put the
 * guest's text after "Message :". Replying to the email reaches the guest.
 */
export function parseAgoda(rawText: string): { conversationId: string | null; message: string | null } {
  const idMatch = rawText.match(/conversationId(?:=|%3D)([\d,]+)/i);
  const conversationId = idMatch ? idMatch[1].replace(/,/g, "") || null : null;

  const text = stripNoise(rawText);
  const m = text.match(
    /^\s*Message\s*:\s*([\s\S]*?)(?=\n\s*(?:Did you know\?|Prompt replies|Replying to this email|REPLY IN YCS|To chat live|-{5,})|$)/im
  );
  return { conversationId, message: m ? m[1].trim() || null : null };
}

function isNoReply(addr: string | null): boolean {
  return !!addr && /(^|[._-])(no-?reply|noreply|do-?not-?reply|automated)@/i.test(addr);
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

  const parsedReplyTo = replyToRaw ? parseAddress(replyToRaw).email : null;
  // automated@airbnb.com, noreply@booking.com and the like can't take replies.
  const replyTo = isNoReply(parsedReplyTo) ? null : parsedReplyTo;

  const messageId =
    str(payload.messageId) || str(payload.MessageID) || headerFromRawBlock(headersRaw, "Message-ID") || headerFromList(payload.Headers, "Message-ID") || null;
  const inReplyTo =
    str(payload.inReplyTo) || headerFromRawBlock(headersRaw, "In-Reply-To") || headerFromList(payload.Headers, "In-Reply-To") || null;

  const channel = detectChannel([from.email, parsedReplyTo || "", toRaw, fromRaw]);
  let guestName = extractGuestName(subject, from.name, channel);
  const reservationCode = extractReservationCode(`${subject}\n${text}`, channel);

  let otaThread: string | null = null;
  let body: string;
  let ignore = false;
  if (channel === "AIRBNB") {
    const airbnb = parseAirbnb(text);
    otaThread = airbnb.threadId ? `airbnb:${airbnb.threadId}` : null;
    guestName =
      airbnb.guestName ||
      subject.match(/reservation (?:confirmed|request|reminder)\s*[-–:]\s*(.+?)\s+(?:arrives|is arriving|wants|requested)/i)?.[1] ||
      guestName;
    // Airbnb sends many account/marketing emails; only ones tied to a guest thread or carrying guest text matter.
    ignore = !airbnb.threadId && !airbnb.message;
    // Booking confirmations and notices carry no guest text: show the subject, not the whole email.
    // A short plain message (older relay emails) is kept; long templated emails collapse to their subject.
    const plain = cleanBody(stripNoise(text));
    body = airbnb.message
      ? cleanBody(airbnb.message)
      : subject && (isNoReply(from.email) || plain.length > 300 || /send\s.+\sa\s+message/i.test(plain))
        ? subject
        : plain;
  } else if (channel === "AGODA") {
    const agoda = parseAgoda(text);
    otaThread = agoda.conversationId ? `agoda:${agoda.conversationId}` : null;
    // The sender's display name is the guest ("Rishabh Khandelwal <notifications@agoda-messaging.com>").
    if (!guestName && from.name && !/agoda/i.test(from.name)) guestName = from.name;
    body = agoda.message ? cleanBody(agoda.message) : subject || cleanBody(stripNoise(text));
  } else {
    body = cleanBody(stripNoise(text));
  }

  // Agoda routes replies sent to its notification address back to the guest.
  let effectiveReplyTo = replyTo;
  if (!effectiveReplyTo && channel === "AGODA" && /agoda-messaging\.com$/.test(from.email)) effectiveReplyTo = from.email;

  // Group by the OTA's own thread id first, then reservation code, then the relay address, then sender + subject.
  const threadKey = otaThread
    ? otaThread
    : reservationCode
      ? `res:${reservationCode}`
      : effectiveReplyTo && channel !== "EMAIL" && channel !== "AGODA"
        ? `relay:${effectiveReplyTo}`
        : `mail:${channel === "EMAIL" ? from.email : effectiveReplyTo || from.email}:${channel === "EMAIL" ? "" : normalizeSubject(subject)}`;

  return {
    channel,
    fromEmail: from.email,
    fromName: from.name,
    replyTo: effectiveReplyTo || (channel === "EMAIL" ? from.email : null),
    subject,
    body,
    messageId: messageId ? messageId.replace(/^<|>$/g, "") : null,
    inReplyTo: inReplyTo ? inReplyTo.replace(/^<|>$/g, "") : null,
    guestName,
    reservationCode,
    threadKey,
    ignore,
    receivedAt: parseReceivedAt(str(payload.date) || str(payload.Date) || headerFromRawBlock(headersRaw, "Date")),
  };
}
