import { runWithWhatsAppProvider, getMetaSendConfig, metaDisplayNumber } from "./config";
import type { MetaInboundMessage } from "./parse";

// One inbound message from the Meta number, through the SAME steps and order as the Twilio webhook
// (app/api/whatsapp/webhook/route.ts):
//   1. log INBOUND (Unified Inbox)  2. staff actions  3. Guest Messages (website)  4. website lead bot  5. guest AI
// Differences forced by Meta: replies are sent as API messages (no TwiML), media arrives as an id, and a photo with
// no caption is still passed to the staff handler (Twilio rejects an empty Body). Everything runs inside the "meta"
// provider context, so every reply, and every event-driven message those actions trigger, goes out from the Meta
// number and never from the Twilio production number.

export const GUEST_MESSAGES_ENTITY = "GUEST_MESSAGES";
export const WEBSITE_LEAD_BOT_ENTITY = "WEBSITE_LEAD_BOT";

export interface PipelineDeps {
  logInbound: (msg: MetaInboundMessage) => Promise<void>;
  resolveMedia: (mediaId: string | null) => Promise<string | null>;
  staffAction: (senderPhone: string, commandText: string, mediaUrl: string | null) => Promise<string | null>;
  guestMessages: (msg: MetaInboundMessage) => Promise<string | null>;
  leadBot: (msg: MetaInboundMessage) => Promise<string[] | null>;
  guestAI: (senderPhone: string, text: string) => Promise<void>;
  send: (toPhone: string, text: string, relatedEntityType?: string) => Promise<boolean>;
  log?: (event: string, meta?: Record<string, string | number | boolean>) => void;
}

export type PipelineOutcome = "staff" | "media_ignored" | "guest_messages" | "lead_bot" | "guest_ai";

export async function processMetaInbound(msg: MetaInboundMessage, deps: PipelineDeps): Promise<PipelineOutcome> {
  return runWithWhatsAppProvider("meta", async () => {
    const log = deps.log || ((e: string, m?: Record<string, string | number | boolean>) => console.warn("[meta-webhook] " + e + (m ? " " + JSON.stringify(m) : "")));
    const meta = { id: msg.id.slice(0, 12) + "…", type: msg.type };

    await deps.logInbound(msg);

    const mediaUrl = await deps.resolveMedia(msg.mediaId);
    const staffReply = await deps.staffAction(msg.senderPhone, msg.text.toUpperCase(), mediaUrl);
    if (staffReply) {
      await deps.send(msg.senderPhone, staffReply);
      log("staff_replied", meta);
      return "staff";
    }

    if (!msg.text) {
      log("media_without_text_ignored", meta); // same as Twilio: nothing to answer
      return "media_ignored";
    }

    const guestReply = await deps.guestMessages(msg);
    if (guestReply) {
      await deps.send(msg.senderPhone, guestReply, GUEST_MESSAGES_ENTITY);
      return "guest_messages";
    }

    const botReplies = await deps.leadBot(msg);
    if (botReplies !== null) {
      for (const r of botReplies) await deps.send(msg.senderPhone, r, WEBSITE_LEAD_BOT_ENTITY);
      return "lead_bot";
    }

    await deps.guestAI(msg.senderPhone, msg.text);
    return "guest_ai";
  });
}

// Production wiring: Prisma, the existing OS handlers, and the Meta senders (all imported lazily).
export function defaultPipelineDeps(): PipelineDeps {
  return {
    logInbound: async (msg) => {
      const { prisma } = await import("@/lib/prisma");
      await prisma.whatsAppMessage.create({
        data: {
          direction: "INBOUND",
          from: "whatsapp:" + msg.senderPhone, // same shape the Twilio webhook stores
          to: metaDisplayNumber(),
          messageType: "text",
          content: msg.text || (msg.mediaId ? "[" + msg.type + "]" : ""),
          status: "RECEIVED",
        },
      });
    },
    resolveMedia: async (mediaId) => {
      if (!mediaId) return null;
      const cfg = getMetaSendConfig();
      if (!cfg.ok) return "meta-media:" + mediaId;
      const { fetchMetaMedia } = await import("./media");
      return fetchMetaMedia(cfg.config, mediaId);
    },
    staffAction: async (phone, text, mediaUrl) => {
      const { handleWhatsAppAction } = await import("@/lib/whatsapp/action-handler");
      return handleWhatsAppAction(phone, text, mediaUrl);
    },
    guestMessages: async (msg) => {
      const { askGuestMessagesForMeta } = await import("./routers");
      const { defaultGuestMessagesRouterDeps } = await import("@/lib/whatsapp/guest-messages-router");
      return askGuestMessagesForMeta(
        { senderPhone: msg.senderPhone, text: msg.text, messageId: msg.id },
        { askUrl: process.env.GUEST_MESSAGES_ASK_URL, apiSecret: process.env.GUEST_MESSAGES_API_SECRET, isKnownContact: defaultGuestMessagesRouterDeps().isKnownContact }
      );
    },
    leadBot: async (msg) => {
      const { forwardToWebsiteLeadBotForMeta } = await import("./routers");
      const { defaultLeadRouterDeps } = await import("@/lib/whatsapp/website-lead-router");
      return forwardToWebsiteLeadBotForMeta(
        { senderPhone: msg.senderPhone, text: msg.text, messageId: msg.id, profileName: msg.profileName, numMedia: msg.mediaId ? 1 : 0 },
        { botUrl: process.env.WEBSITE_LEAD_BOT_META_URL, secret: process.env.LEAD_BOT_OS_SECRET, isKnownContact: defaultLeadRouterDeps().isKnownContact }
      );
    },
    guestAI: async (phone, text) => {
      const { handleGuestAIChat } = await import("@/lib/whatsapp/ai-handler");
      await handleGuestAIChat(phone, text);
    },
    send: async (to, text, relatedEntityType) => {
      const { sendWhatsAppMessage } = await import("@/lib/whatsapp/client");
      const r = await sendWhatsAppMessage(to, "text", text, undefined, relatedEntityType);
      return r.success;
    },
  };
}
