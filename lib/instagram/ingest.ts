import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyAdmin } from "@/lib/notifications/service";
import { otaMessage } from "@/lib/notifications/builders";
import { getInstagramSendConfig } from "./config";
import { fetchInstagramProfile } from "./send";
import type { InstagramDM } from "./parse";

// Files Instagram DMs in the unified inbox (InboxConversation / InboxMessage, channel INSTAGRAM).
// One conversation per guest: externalThreadId "ig:<IGSID>", replyTo is the IGSID replies are sent to.
// A message id already stored (a Meta retry, or the echo of a reply sent from the OS) is skipped.

export const IG_THREAD_PREFIX = "ig:";

export interface InstagramIngestDeps {
  db: typeof prisma;
  lookupProfile: (igsid: string) => Promise<{ name: string | null; username: string | null }>;
  notify: (draft: ReturnType<typeof otaMessage>) => Promise<unknown>;
}

export function defaultInstagramIngestDeps(): InstagramIngestDeps {
  return {
    db: prisma,
    lookupProfile: async (igsid) => {
      const cfg = getInstagramSendConfig();
      return cfg.ok ? fetchInstagramProfile(cfg.config, igsid) : { name: null, username: null };
    },
    notify: (draft) => notifyAdmin(draft),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export type InstagramIngestResult = "stored" | "duplicate";

export async function ingestInstagramDM(dm: InstagramDM, deps: InstagramIngestDeps): Promise<InstagramIngestResult> {
  const { db } = deps;
  if (await db.inboxMessage.findUnique({ where: { externalMessageId: dm.mid } })) return "duplicate";

  const threadKey = IG_THREAD_PREFIX + dm.guestId;
  const existing = await db.inboxConversation.findUnique({
    where: { channel_externalThreadId: { channel: "INSTAGRAM", externalThreadId: threadKey } },
  });

  // Name the guest once (or retry if the first lookup failed).
  let profile: { name: string | null; username: string | null } = { name: null, username: null };
  if (!existing?.guestName) profile = await deps.lookupProfile(dm.guestId).catch(() => ({ name: null, username: null }));
  const handle = profile.username ? "@" + profile.username : null;
  const guestName = profile.name || handle;

  const inbound = dm.direction === "INBOUND";
  const preview = dm.text.slice(0, 160);
  const isLatest = !existing || dm.at >= existing.lastMessageAt;

  const upsert = () =>
    db.inboxConversation.upsert({
      where: { channel_externalThreadId: { channel: "INSTAGRAM", externalThreadId: threadKey } },
      create: {
        channel: "INSTAGRAM",
        externalThreadId: threadKey,
        guestName,
        guestContact: handle,
        replyTo: dm.guestId,
        lastMessageAt: dm.at,
        lastMessagePreview: preview,
        ...(inbound ? { lastInboundAt: dm.at } : { lastReadAt: dm.at }),
      },
      update: {
        ...(guestName ? { guestName } : {}),
        ...(handle ? { guestContact: handle } : {}),
        ...(isLatest ? { lastMessageAt: dm.at, lastMessagePreview: preview } : {}),
        // A new guest message re-opens a closed conversation; a reply from the Instagram app counts as read.
        ...(inbound && isLatest ? { status: "OPEN" as const, lastInboundAt: dm.at } : {}),
        ...(!inbound && isLatest ? { lastReadAt: dm.at } : {}),
      },
    });

  let conversation;
  try {
    conversation = await upsert();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    conversation = await upsert(); // a parallel delivery created it first
  }

  try {
    await db.inboxMessage.create({
      data: {
        conversationId: conversation.id,
        direction: dm.direction,
        body: dm.text,
        senderName: inbound ? conversation.guestName : "Instagram app",
        externalMessageId: dm.mid,
        status: inbound ? "RECEIVED" : "SENT",
        createdAt: dm.at,
        raw: dm.raw == null ? undefined : (dm.raw as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }

  if (inbound && Date.now() - dm.at.getTime() < 24 * 60 * 60 * 1000) {
    await deps
      .notify(
        otaMessage({
          channel: "INSTAGRAM",
          guestName: conversation.guestName,
          body: dm.text,
          conversationId: conversation.id,
          propertyId: conversation.propertyId,
        })
      )
      .catch(() => undefined);
  }
  return "stored";
}
