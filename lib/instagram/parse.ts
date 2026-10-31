// Turns an Instagram webhook delivery into the DMs the inbox stores. Pure; never throws.
//
// Shape (object "instagram"):
//   { object: "instagram", entry: [{ id: <our account id>, messaging: [{ sender: { id }, recipient: { id }, timestamp,
//       message: { mid, text?, attachments?: [{ type, payload: { url } }], is_echo?, is_deleted?, is_unsupported?,
//                  reply_to?: { story?: { url, id } } } }] }] }
// Echoes (is_echo) are messages our own account sent - from the Instagram app or from the OS - and are kept as OUTBOUND
// so the thread stays complete (the OS's own sends are skipped later by their message id). Reactions, reads,
// postbacks and deletions are ignored.

export interface InstagramDM {
  mid: string;
  /** The guest's Instagram-scoped id (IGSID): the sender for inbound, the recipient for echoes. */
  guestId: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string;
  at: Date;
  raw: unknown;
}

const ATTACHMENT_LABELS: Record<string, string> = {
  image: "[Photo]",
  video: "[Video]",
  audio: "[Voice message]",
  file: "[File]",
  share: "[Shared post]",
  ig_reel: "[Shared reel]",
  reel: "[Shared reel]",
  story_mention: "[Mentioned you in their story]",
  animated_image: "[GIF]",
  sticker: "[Sticker]",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function messageText(message: Record<string, any>): string {
  const parts: string[] = [];
  if (message.reply_to && typeof message.reply_to === "object" && message.reply_to.story) parts.push("[Replied to your story]");
  const text = str(message.text).trim();
  if (text) parts.push(text);
  if (Array.isArray(message.attachments)) {
    for (const a of message.attachments) {
      const label = ATTACHMENT_LABELS[str(a?.type)] || "[Attachment]";
      if (!parts.includes(label)) parts.push(label);
    }
  }
  if (!parts.length && message.is_unsupported) parts.push("[Message type not supported - open Instagram to see it]");
  return parts.join(" ").trim();
}

export function parseInstagramWebhook(body: unknown, ownAccountId: string): InstagramDM[] {
  const out: InstagramDM[] = [];
  try {
    if (!ownAccountId || !body || typeof body !== "object") return out;
    const b = body as Record<string, any>;
    if (b.object !== "instagram" || !Array.isArray(b.entry)) return out;
    for (const entry of b.entry) {
      if (str(entry?.id) !== ownAccountId || !Array.isArray(entry?.messaging)) continue;
      for (const ev of entry.messaging) {
        const message = ev?.message;
        if (!message || typeof message !== "object" || message.is_deleted) continue;
        const mid = str(message.mid);
        const senderId = str(ev?.sender?.id);
        const recipientId = str(ev?.recipient?.id);
        if (!mid || !senderId || !recipientId) continue;
        const echo = Boolean(message.is_echo) || senderId === ownAccountId;
        const guestId = echo ? recipientId : senderId;
        if (!guestId || guestId === ownAccountId) continue;
        const text = messageText(message);
        if (!text) continue;
        const ts = typeof ev.timestamp === "number" ? ev.timestamp : Number(ev.timestamp);
        out.push({
          mid,
          guestId,
          direction: echo ? "OUTBOUND" : "INBOUND",
          text,
          at: Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date(),
          raw: ev,
        });
      }
    }
  } catch {
    return out;
  }
  return out;
}
