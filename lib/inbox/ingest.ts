import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedInboundEmail } from "./email-parser";

/** Finds the booking an OTA message belongs to: by reservation code first, then by guest name. */
export async function matchReservation(code: string | null, guestName: string | null) {
  const include = { guest: true } as const;

  if (code) {
    const byCode = await prisma.reservation.findFirst({
      where: {
        OR: [
          { intellistayReservationId: code },
          { bookingNotes: { contains: code, mode: "insensitive" } },
        ],
      },
      include,
      orderBy: { checkIn: "desc" },
    });
    if (byCode) return byCode;
  }

  if (guestName && guestName.trim().length >= 3) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates = await prisma.reservation.findMany({
      where: {
        checkOut: { gte: since },
        guest: { name: { contains: guestName.trim(), mode: "insensitive" } },
      },
      include,
      orderBy: { checkIn: "asc" },
      take: 5,
    });
    // Prefer the stay closest to today.
    const now = Date.now();
    candidates.sort((a, b) => Math.abs(a.checkIn.getTime() - now) - Math.abs(b.checkIn.getTime() - now));
    if (candidates[0]) return candidates[0];
  }

  return null;
}

export type IngestResult = { conversationId: string; messageId: string; duplicate: boolean };

/** Stores a parsed inbound email as a message in its conversation (creating the conversation if new). */
export async function ingestInboundEmail(parsed: ParsedInboundEmail, raw: unknown): Promise<IngestResult> {
  if (parsed.messageId) {
    const existing = await prisma.inboxMessage.findUnique({ where: { externalMessageId: parsed.messageId } });
    if (existing) return { conversationId: existing.conversationId, messageId: existing.id, duplicate: true };
  }

  const existingConversation = await prisma.inboxConversation.findUnique({
    where: { channel_externalThreadId: { channel: parsed.channel, externalThreadId: parsed.threadKey } },
  });

  let link: { reservationId?: string; guestId?: string; propertyId?: string } = {};
  if (!existingConversation?.reservationId) {
    const reservation = await matchReservation(parsed.reservationCode, parsed.guestName);
    if (reservation) {
      link = { reservationId: reservation.id, guestId: reservation.guestId, propertyId: reservation.propertyId };
    }
  }

  const now = new Date();
  const preview = parsed.body.slice(0, 160);

  const conversation = await prisma.inboxConversation.upsert({
    where: { channel_externalThreadId: { channel: parsed.channel, externalThreadId: parsed.threadKey } },
    create: {
      channel: parsed.channel,
      externalThreadId: parsed.threadKey,
      subject: parsed.subject || null,
      guestName: parsed.guestName,
      guestContact: parsed.channel === "EMAIL" ? parsed.fromEmail : parsed.replyTo,
      replyTo: parsed.replyTo,
      lastMessageAt: now,
      lastInboundAt: now,
      lastMessagePreview: preview,
      ...link,
    },
    update: {
      // A new guest message re-opens a closed conversation.
      status: "OPEN",
      lastMessageAt: now,
      lastInboundAt: now,
      lastMessagePreview: preview,
      ...(parsed.replyTo ? { replyTo: parsed.replyTo } : {}),
      ...(parsed.guestName && !existingConversation?.guestName ? { guestName: parsed.guestName } : {}),
      ...link,
    },
  });

  const message = await prisma.inboxMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      body: parsed.body || "(empty message)",
      senderName: parsed.guestName || parsed.fromName || parsed.fromEmail,
      externalMessageId: parsed.messageId,
      status: "RECEIVED",
      raw: raw == null ? undefined : (raw as Prisma.InputJsonValue),
    },
  });

  return { conversationId: conversation.id, messageId: message.id, duplicate: false };
}
