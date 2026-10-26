import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { CHANNELS, type InboxChannelId } from "./channels";
import { sendEmailReply, gmailBridgeConfigured, resendConfigured, sendViaGmailBridge } from "./email-send";
import type {
  ActionResult,
  InboxConversationSummary,
  InboxMessageView,
  InboxReservationSummary,
  InboxThread,
} from "./types";

const WA_PREFIX = "wa:";
const WHATSAPP_WINDOW_HOURS = 24;

const reservationInclude = { unit: true, property: true } as const;

type ReservationWithPlace = {
  id: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  source: string;
  totalAmount: number;
  bookingNotes: string | null;
  unit: { name: string } | null;
  property: { name: string; address: string } | null;
};

function toReservationSummary(r: ReservationWithPlace | null | undefined): InboxReservationSummary | null {
  if (!r) return null;
  return {
    id: r.id,
    unitName: r.unit?.name ?? null,
    propertyName: r.property?.name ?? null,
    propertyAddress: r.property?.address ?? null,
    checkIn: r.checkIn.toISOString(),
    checkOut: r.checkOut.toISOString(),
    status: r.status,
    source: r.source,
    totalAmount: r.totalAmount,
    notes: r.bookingNotes,
  };
}

function isUnread(lastInboundAt: Date | null, lastReadAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  return !lastReadAt || lastInboundAt > lastReadAt;
}

// ---------------------------------------------------------------- WhatsApp threads

type WaMessage = Awaited<ReturnType<typeof prisma.whatsAppMessage.findMany>>[number];

interface WaThread {
  phone: string;
  messages: WaMessage[]; // newest first
}

/** Groups WhatsApp messages into guest threads. Staff numbers and broadcast-only threads are left out. */
async function loadWhatsAppThreads(): Promise<WaThread[]> {
  const [messages, team] = await Promise.all([
    prisma.whatsAppMessage.findMany({ orderBy: { createdAt: "desc" }, take: 1500 }),
    prisma.teamMember.findMany({ select: { phone: true, whatsappNumber: true } }),
  ]);
  const staffPhones = new Set(
    team.flatMap((t) => [normalizePhoneNumber(t.whatsappNumber), normalizePhoneNumber(t.phone)]).filter(Boolean)
  );
  const systemPhone = normalizePhoneNumber(process.env.TWILIO_WHATSAPP_NUMBER);

  const threads = new Map<string, WaThread>();
  for (const msg of messages) {
    const phone = normalizePhoneNumber(msg.direction === "OUTBOUND" ? msg.to : msg.from);
    if (!phone || phone === systemPhone || staffPhones.has(phone)) continue;
    if (!threads.has(phone)) threads.set(phone, { phone, messages: [] });
    threads.get(phone)!.messages.push(msg);
  }
  // Only real conversations: the guest has written at least once.
  return [...threads.values()].filter((t) => t.messages.some((m) => m.direction === "INBOUND"));
}

async function guestsByPhone(phones: string[]) {
  if (phones.length === 0) return new Map<string, { id: string; name: string; reservation: ReservationWithPlace | null; propertyId: string | null }>();
  const guests = await prisma.guest.findMany({
    include: { reservations: { orderBy: { checkIn: "desc" }, take: 1, include: reservationInclude } },
  });
  const wanted = new Set(phones);
  const map = new Map<string, { id: string; name: string; reservation: ReservationWithPlace | null; propertyId: string | null }>();
  for (const g of guests) {
    const phone = normalizePhoneNumber(g.phone);
    if (!wanted.has(phone) || map.has(phone)) continue;
    const reservation = g.reservations[0] ?? null;
    map.set(phone, { id: g.id, name: g.name, reservation, propertyId: reservation?.propertyId ?? null });
  }
  return map;
}

function waSummary(
  thread: WaThread,
  guest: { name: string; reservation: ReservationWithPlace | null; propertyId: string | null } | undefined,
  state: { status: "OPEN" | "CLOSED"; lastReadAt: Date | null; assignee: { id: string; name: string } | null } | undefined
): InboxConversationSummary {
  const latest = thread.messages[0];
  const lastInbound = thread.messages.find((m) => m.direction === "INBOUND");
  // A newer guest message re-opens a conversation the team had closed.
  const closed = state?.status === "CLOSED" && !(lastInbound && state.lastReadAt && lastInbound.createdAt > state.lastReadAt);
  return {
    key: `${WA_PREFIX}${thread.phone}`,
    channel: "WHATSAPP",
    guestName: guest?.name || thread.phone,
    contact: thread.phone,
    subject: null,
    preview: (latest.content || latest.templateName || "").slice(0, 160),
    lastMessageAt: latest.createdAt.toISOString(),
    // Replied to (from here or the WhatsApp page) counts as read.
    unread: latest.direction === "INBOUND" && isUnread(lastInbound?.createdAt ?? null, state?.lastReadAt ?? null),
    status: closed ? "CLOSED" : "OPEN",
    assignee: state?.assignee ?? null,
    propertyId: guest?.propertyId ?? null,
    reservation: toReservationSummary(guest?.reservation),
  };
}

// ---------------------------------------------------------------- listing

export async function listConversations(propertyId: string = "ALL"): Promise<InboxConversationSummary[]> {
  const waThreads = await loadWhatsAppThreads();
  const phones = waThreads.map((t) => t.phone);

  const [guests, waStates, otherConversations] = await Promise.all([
    guestsByPhone(phones),
    prisma.inboxConversation.findMany({
      where: { channel: "WHATSAPP", externalThreadId: { in: phones } },
      include: { assignee: { select: { id: true, name: true } } },
    }),
    prisma.inboxConversation.findMany({
      where: { channel: { not: "WHATSAPP" } },
      include: {
        assignee: { select: { id: true, name: true } },
        reservation: { include: reservationInclude },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 300,
    }),
  ]);

  const stateByPhone = new Map(waStates.map((s) => [s.externalThreadId, s]));

  const summaries: InboxConversationSummary[] = waThreads.map((t) => {
    const s = stateByPhone.get(t.phone);
    return waSummary(t, guests.get(t.phone), s ? { status: s.status, lastReadAt: s.lastReadAt, assignee: s.assignee } : undefined);
  });

  for (const c of otherConversations) {
    summaries.push({
      key: c.id,
      channel: c.channel as InboxChannelId,
      guestName: c.guestName || c.guestContact || CHANNELS[c.channel as InboxChannelId].label + " guest",
      contact: c.guestContact,
      subject: c.subject,
      preview: c.lastMessagePreview || "",
      lastMessageAt: c.lastMessageAt.toISOString(),
      unread: isUnread(c.lastInboundAt, c.lastReadAt),
      status: c.status,
      assignee: c.assignee,
      propertyId: c.propertyId ?? c.reservation?.propertyId ?? null,
      reservation: toReservationSummary(c.reservation),
    });
  }

  return summaries
    .filter((s) => propertyId === "ALL" || s.propertyId === propertyId || s.propertyId === null)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

// ---------------------------------------------------------------- one thread

/** Returns the InboxConversation row for a key, creating the state row for a WhatsApp thread on first use. */
async function conversationRow(key: string) {
  if (key.startsWith(WA_PREFIX)) {
    const phone = normalizePhoneNumber(key.slice(WA_PREFIX.length));
    if (!phone) return null;
    return prisma.inboxConversation.upsert({
      where: { channel_externalThreadId: { channel: "WHATSAPP", externalThreadId: phone } },
      create: { channel: "WHATSAPP", externalThreadId: phone, guestContact: phone },
      update: {},
    });
  }
  return prisma.inboxConversation.findUnique({ where: { id: key } });
}

export async function getThread(key: string): Promise<InboxThread | null> {
  if (key.startsWith(WA_PREFIX)) {
    const phone = normalizePhoneNumber(key.slice(WA_PREFIX.length));
    const thread = (await loadWhatsAppThreads()).find((t) => t.phone === phone);
    if (!thread) return null;
    const [guests, state] = await Promise.all([
      guestsByPhone([phone]),
      prisma.inboxConversation.findUnique({
        where: { channel_externalThreadId: { channel: "WHATSAPP", externalThreadId: phone } },
        include: { assignee: { select: { id: true, name: true } } },
      }),
    ]);
    const conversation = waSummary(thread, guests.get(phone), state ?? undefined);
    const lastInbound = thread.messages.find((m) => m.direction === "INBOUND");
    const hoursSince = lastInbound ? (Date.now() - lastInbound.createdAt.getTime()) / 36e5 : Infinity;
    const inWindow = hoursSince <= WHATSAPP_WINDOW_HOURS;
    return {
      conversation,
      messages: [...thread.messages].reverse().map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.content || (m.templateName ? `Template: ${m.templateName}` : ""),
        at: m.createdAt.toISOString(),
        senderName: null,
        status: m.status,
      })),
      canReply: inWindow,
      replyNote: inWindow ? null : "The 24-hour WhatsApp window has closed. Send an approved template from the WhatsApp page.",
      extranetUrl: null,
    };
  }

  const c = await prisma.inboxConversation.findUnique({
    where: { id: key },
    include: {
      assignee: { select: { id: true, name: true } },
      reservation: { include: reservationInclude },
      messages: { orderBy: { createdAt: "asc" }, take: 500, include: { sentBy: { select: { name: true } } } },
    },
  });
  if (!c) return null;
  const channel = c.channel as InboxChannelId;
  // Gmail sending needs the newest guest email to have come through the Gmail bridge (it carries Gmail's id).
  const lastInbound = [...c.messages].reverse().find((m) => m.direction === "INBOUND");
  const mailReady = resendConfigured() || (gmailBridgeConfigured() && Boolean(gmailIdOf(lastInbound?.raw)));

  const conversation: InboxConversationSummary = {
    key: c.id,
    channel,
    guestName: c.guestName || c.guestContact || CHANNELS[channel].label + " guest",
    contact: c.guestContact,
    subject: c.subject,
    preview: c.lastMessagePreview || "",
    lastMessageAt: c.lastMessageAt.toISOString(),
    unread: isUnread(c.lastInboundAt, c.lastReadAt),
    status: c.status,
    assignee: c.assignee,
    propertyId: c.propertyId ?? c.reservation?.propertyId ?? null,
    reservation: toReservationSummary(c.reservation),
  };

  const messages: InboxMessageView[] = c.messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    body: m.body,
    at: m.createdAt.toISOString(),
    senderName: m.direction === "OUTBOUND" ? m.sentBy?.name ?? m.senderName : m.senderName,
    status: m.status,
  }));

  // Airbnb emails carry the thread id, so link straight to that conversation.
  const airbnbThread = c.externalThreadId.match(/^airbnb:(\d+)$/)?.[1];
  const extranetUrl = airbnbThread
    ? `https://www.airbnb.com/hosting/thread/${airbnbThread}`
    : CHANNELS[channel].extranetUrl ?? null;

  let replyNote: string | null = null;
  if (!c.replyTo)
    replyNote =
      channel === "AIRBNB"
        ? "Airbnb doesn't accept email replies. Draft here, copy it, then reply in Airbnb."
        : channel === "MAKEMYTRIP"
          ? "MakeMyTrip doesn't take email replies for this message. Draft here, copy it, then reply in the MakeMyTrip Connect app."
          : `No reply address came with this ${CHANNELS[channel].label} message. Reply from the extranet.`;
  else if (!mailReady)
    replyNote = gmailBridgeConfigured()
      ? "This message came in before sending was set up. Reply from the extranet; new messages can be answered here."
      : "Sending from the OS isn't set up yet. Reply from the extranet for now.";

  return {
    conversation,
    messages,
    canReply: Boolean(c.replyTo) && mailReady,
    replyNote,
    extranetUrl,
  };
}

// ---------------------------------------------------------------- actions

export async function sendReply(key: string, body: string, senderId: string | null): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return { success: false, error: "Write a message first." };

  if (key.startsWith(WA_PREFIX)) {
    const thread = await getThread(key);
    if (!thread) return { success: false, error: "Conversation not found." };
    if (!thread.canReply) return { success: false, error: thread.replyNote || "Can't reply on WhatsApp right now." };
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/client");
    const result = await sendWhatsAppMessage(thread.conversation.contact!, "text", text, undefined, "MANUAL_REPLY", "INBOX");
    if (!result.success) return { success: false, error: "WhatsApp send failed. Check the Twilio settings." };
    const row = await conversationRow(key);
    if (row) await prisma.inboxConversation.update({ where: { id: row.id }, data: { lastReadAt: new Date(), lastMessageAt: new Date() } });
    return { success: true };
  }

  const c = await prisma.inboxConversation.findUnique({
    where: { id: key },
    include: { messages: { where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!c) return { success: false, error: "Conversation not found." };
  if (!c.replyTo) return { success: false, error: "No reply address for this conversation. Reply from the extranet." };

  // Prefer the Gmail bridge: it replies from the mailbox the OTA knows, in the same thread.
  const gmailId = gmailIdOf(c.messages[0]?.raw)
  let sent
  if (gmailBridgeConfigured() && gmailId) {
    sent = await sendViaGmailBridge(gmailId, text)
  } else if (resendConfigured()) {
    const subject = c.subject ? (/^re:/i.test(c.subject) ? c.subject : `Re: ${c.subject}`) : "Re: your message";
    sent = await sendEmailReply({ to: c.replyTo, subject, text, inReplyTo: c.messages[0]?.externalMessageId });
  } else {
    sent = {
      ok: false as const,
      error: gmailBridgeConfigured()
        ? "This message came in before Gmail sending was set up, so it can't be answered from here. Reply from the extranet."
        : "Sending from the OS isn't set up yet. Reply from the extranet for now.",
    }
  }
  if (!sent.ok) return { success: false, error: sent.error };

  const now = new Date();
  await prisma.$transaction([
    prisma.inboxMessage.create({
      data: { conversationId: c.id, direction: "OUTBOUND", body: text, sentById: senderId, status: "SENT", externalMessageId: sent.id },
    }),
    prisma.inboxConversation.update({
      where: { id: c.id },
      data: { lastMessageAt: now, lastMessagePreview: text.slice(0, 160), lastReadAt: now },
    }),
  ]);
  return { success: true };
}

/** Gmail's own id for a received email, stored by the Gmail bridge in the raw payload. */
function gmailIdOf(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const id = (raw as { gmailId?: unknown }).gmailId
  return typeof id === "string" && id ? id : null
}

export async function assignConversation(key: string, teamMemberId: string | null): Promise<ActionResult> {
  const row = await conversationRow(key);
  if (!row) return { success: false, error: "Conversation not found." };
  await prisma.inboxConversation.update({ where: { id: row.id }, data: { assigneeId: teamMemberId } });
  return { success: true };
}

export async function setConversationStatus(key: string, status: "OPEN" | "CLOSED"): Promise<ActionResult> {
  const row = await conversationRow(key);
  if (!row) return { success: false, error: "Conversation not found." };
  // Closing also marks it read, so a later guest message can re-open it.
  await prisma.inboxConversation.update({
    where: { id: row.id },
    data: { status, ...(status === "CLOSED" ? { lastReadAt: new Date() } : {}) },
  });
  return { success: true };
}

export async function markConversationRead(key: string): Promise<ActionResult> {
  const row = await conversationRow(key);
  if (!row) return { success: false, error: "Conversation not found." };
  await prisma.inboxConversation.update({ where: { id: row.id }, data: { lastReadAt: new Date() } });
  return { success: true };
}

export async function linkReservation(key: string, reservationId: string | null): Promise<ActionResult> {
  if (key.startsWith(WA_PREFIX)) return { success: false, error: "WhatsApp threads are linked by the guest's phone number." };
  const reservation = reservationId ? await prisma.reservation.findUnique({ where: { id: reservationId } }) : null;
  if (reservationId && !reservation) return { success: false, error: "Booking not found." };
  await prisma.inboxConversation.update({
    where: { id: key },
    data: {
      reservationId: reservation?.id ?? null,
      guestId: reservation?.guestId ?? null,
      propertyId: reservation?.propertyId ?? null,
    },
  });
  return { success: true };
}

export async function searchReservations(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.reservation.findMany({
    where: {
      OR: [
        { guest: { name: { contains: q, mode: "insensitive" } } },
        { intellistayReservationId: { contains: q } },
        { bookingNotes: { contains: q, mode: "insensitive" } },
      ],
    },
    include: { guest: true, ...reservationInclude },
    orderBy: { checkIn: "desc" },
    take: 10,
  });
  return rows.map((r) => ({
    id: r.id,
    guestName: r.guest.name,
    unitName: r.unit?.name ?? null,
    checkIn: r.checkIn.toISOString(),
    checkOut: r.checkOut.toISOString(),
    source: r.source,
  }));
}

export async function draftReply(key: string): Promise<ActionResult<{ draft: string }>> {
  const thread = await getThread(key);
  if (!thread || thread.messages.length === 0) return { success: false, error: "Nothing to reply to yet." };
  if (!process.env.GROQ_API_KEY) return { success: false, error: "AI drafts need GROQ_API_KEY." };

  const history = thread.messages
    .slice(-12)
    .map((m) => `${m.direction === "INBOUND" ? "Guest" : "Host"}: ${m.body}`)
    .join("\n");
  const r = thread.conversation.reservation;
  const booking = r
    ? `Booking: ${r.unitName ?? "unit"} at ${r.propertyName ?? "our property"} (${r.propertyAddress ?? ""}), check-in ${r.checkIn.slice(0, 10)} after 1PM, check-out ${r.checkOut.slice(0, 10)} before 10AM, status ${r.status}.`
    : "No booking linked.";

  const { ai } = await import("@/lib/ai/groq");
  try {
    const completion = await ai.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content:
            `You reply to guests for Ritumbhara Hospitality on ${CHANNELS[thread.conversation.channel].label}. ` +
            "Write a short, warm, professional reply (max 3 sentences). Use only facts from the booking details and conversation. " +
            "Never invent prices, codes or policies. No placeholders like [Name]. No quotes around the reply." +
            (thread.conversation.channel !== "WHATSAPP" ? " Do not share phone numbers, emails or links: OTA rules forbid it before check-in." : ""),
        },
        { role: "user", content: `${booking}\n\nConversation:\n${history}\n\nWrite the next Host reply:` },
      ],
    });
    return { success: true, data: { draft: completion.choices[0]?.message?.content?.trim() || "" } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Draft failed" };
  }
}
