import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedInboundEmail } from "./email-parser";
import { notifyAdmin } from "@/lib/notifications/service";
import { otaMessage } from "@/lib/notifications/builders";

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
    if (existing) {
      await refreshExisting(existing.id, existing.conversationId, parsed);
      return { conversationId: existing.conversationId, messageId: existing.id, duplicate: true };
    }
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

  // Older emails (e.g. from a resync) keep their own date instead of jumping to the top.
  const at = parsed.receivedAt ?? new Date();
  const preview = parsed.body.slice(0, 160);
  const isLatest = !existingConversation || at >= existingConversation.lastMessageAt;

  const conversation = await prisma.inboxConversation.upsert({
    where: { channel_externalThreadId: { channel: parsed.channel, externalThreadId: parsed.threadKey } },
    create: {
      channel: parsed.channel,
      externalThreadId: parsed.threadKey,
      subject: parsed.subject || null,
      guestName: parsed.guestName,
      guestContact: parsed.channel === "EMAIL" ? parsed.fromEmail : parsed.replyTo,
      replyTo: parsed.replyTo,
      lastMessageAt: at,
      lastInboundAt: at,
      lastMessagePreview: preview,
      ...link,
    },
    update: {
      // A new guest message re-opens a closed conversation; an older one filed late doesn't.
      ...(isLatest ? { status: "OPEN" as const, lastMessageAt: at, lastInboundAt: at, lastMessagePreview: preview } : {}),
      ...(parsed.replyTo ? { replyTo: parsed.replyTo } : {}),
      ...(parsed.guestName && !existingConversation?.guestName ? { guestName: parsed.guestName } : {}),
      ...link,
    },
  });

  try {
    const message = await prisma.inboxMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        body: parsed.body || "(empty message)",
        senderName: parsed.guestName || parsed.fromName || parsed.fromEmail,
        externalMessageId: parsed.messageId,
        status: "RECEIVED",
        createdAt: at,
        raw: raw == null ? undefined : (raw as Prisma.InputJsonValue),
      },
    });
    // A message older than a day (a resync of old emails) is stored but not announced.
    if (Date.now() - at.getTime() < 24 * 60 * 60 * 1000) {
      await notifyAdmin(otaMessage({
        channel: parsed.channel,
        guestName: conversation.guestName ?? parsed.guestName,
        body: parsed.body,
        conversationId: conversation.id,
        propertyId: conversation.propertyId,
      }));
    }
    return { conversationId: conversation.id, messageId: message.id, duplicate: false };
  } catch (err) {
    // Two deliveries of the same email at once (e.g. the 5-minute trigger and a manual run):
    // the other one already stored it.
    if (isUniqueViolation(err) && parsed.messageId) {
      const existing = await prisma.inboxMessage.findUnique({ where: { externalMessageId: parsed.messageId } });
      if (existing) return { conversationId: existing.conversationId, messageId: existing.id, duplicate: true };
    }
    throw err;
  }
}

/**
 * A re-delivered email (e.g. after the Gmail bridge is re-run) is parsed again with the
 * current parser, so earlier mis-parsed messages fix themselves.
 */
async function refreshExisting(messageId: string, conversationId: string, parsed: ParsedInboundEmail) {
  await prisma.inboxMessage.update({
    where: { id: messageId },
    data: {
      body: parsed.body || "(empty message)",
      senderName: parsed.guestName || parsed.fromName || parsed.fromEmail,
      // Messages stored before the bridge sent dates were stamped with the sync time.
      ...(parsed.receivedAt ? { createdAt: parsed.receivedAt } : {}),
    },
  });
  const latest = await prisma.inboxMessage.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" } });
  const latestInbound = await prisma.inboxMessage.findFirst({
    where: { conversationId, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
  });
  await prisma.inboxConversation.update({
    where: { id: conversationId },
    data: {
      ...(parsed.guestName ? { guestName: parsed.guestName } : {}),
      ...(parsed.replyTo ? { replyTo: parsed.replyTo } : {}),
      ...(latest ? { lastMessageAt: latest.createdAt, lastMessagePreview: latest.body.slice(0, 160) } : {}),
      ...(latestInbound ? { lastInboundAt: latestInbound.createdAt } : {}),
    },
  });
}

/** Removes a stored message that the parser now classifies as a notice, and its conversation if that leaves it empty. */
export async function removeIgnoredMessage(externalMessageId: string | null): Promise<boolean> {
  if (!externalMessageId) return false;
  const existing = await prisma.inboxMessage.findUnique({ where: { externalMessageId } });
  if (!existing) return false;
  await prisma.inboxMessage.delete({ where: { id: existing.id } });
  const left = await prisma.inboxMessage.count({ where: { conversationId: existing.conversationId } });
  if (left === 0) await prisma.inboxConversation.delete({ where: { id: existing.conversationId } });
  return true;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Same as ingestInboundEmail, retried once if a parallel delivery created the conversation first. */
export async function ingestInboundEmailSafely(parsed: ParsedInboundEmail, raw: unknown): Promise<IngestResult> {
  try {
    return await ingestInboundEmail(parsed, raw);
  } catch (err) {
    if (isUniqueViolation(err)) return ingestInboundEmail(parsed, raw);
    throw err;
  }
}
