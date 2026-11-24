// Parses a Meta WhatsApp Cloud API webhook body into the inbound messages the OS cares about.
// Inbound messages and delivery-status events ("statuses": sent / delivered / read / failed) are parsed separately.
// Only events for our own phone number id are kept.

export interface MetaInboundMessage {
  id: string; // wamid.… (used for de-duplication)
  phoneNumberId: string; // our number that received it
  senderPhone: string; // "+<digits>", the same shape the Twilio route passes on ("whatsapp:" prefix removed)
  text: string; // text, button text, interactive reply title, or media caption ("" when none)
  type: string; // text | image | document | audio | video | button | interactive | ...
  mediaId: string | null; // image/document/video/audio id, downloaded separately
  profileName: string | null;
  timestamp: number; // seconds
}

const MAX_TEXT = 4096;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function textOf(m: Record<string, any>): { text: string; mediaId: string | null } {
  const type = str(m.type);
  if (type === "text") return { text: str(m.text?.body), mediaId: null };
  if (type === "button") return { text: str(m.button?.text) || str(m.button?.payload), mediaId: null };
  if (type === "interactive") {
    const i = m.interactive || {};
    return { text: str(i.button_reply?.title) || str(i.list_reply?.title), mediaId: null };
  }
  if (type === "image" || type === "document" || type === "video" || type === "audio" || type === "sticker") {
    const media = m[type] || {};
    return { text: str(media.caption), mediaId: str(media.id) || null };
  }
  return { text: "", mediaId: null };
}

export function parseMetaWebhook(body: unknown, ownPhoneNumberId?: string): MetaInboundMessage[] {
  const out: MetaInboundMessage[] = [];
  if (!body || typeof body !== "object" || (body as any).object !== "whatsapp_business_account") return out;
  const entries = Array.isArray((body as any).entry) ? (body as any).entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field !== "messages") continue;
      const value = change.value || {};
      const phoneNumberId = str(value.metadata?.phone_number_id);
      if (ownPhoneNumberId && phoneNumberId !== ownPhoneNumberId) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const m of messages) {
        const id = str(m?.id);
        const digits = str(m?.from).replace(/\D/g, "");
        if (!id || digits.length < 8 || digits.length > 15) continue;
        const { text, mediaId } = textOf(m);
        const contact = contacts.find((c: any) => str(c?.wa_id) === digits);
        out.push({
          id,
          phoneNumberId,
          senderPhone: "+" + digits,
          text: text.trim().slice(0, MAX_TEXT),
          type: str(m.type),
          mediaId,
          profileName: str(contact?.profile?.name).slice(0, 100) || null,
          timestamp: Number(m.timestamp) || 0,
        });
      }
    }
  }
  return out;
}

export type MetaDeliveryState = "sent" | "delivered" | "read" | "failed";

export interface MetaStatusEvent {
  id: string; // wamid of OUR outbound message
  status: MetaDeliveryState;
  recipientDigits: string; // recipient, digits only (never logged in full)
  timestamp: number; // seconds
  errorCode: number | null; // set on "failed"
  errorTitle: string | null;
}

const STATES = new Set(["sent", "delivered", "read", "failed"]);

// Delivery-status events for messages sent from our own phone number id.
export function parseMetaStatuses(body: unknown, ownPhoneNumberId?: string): MetaStatusEvent[] {
  const out: MetaStatusEvent[] = [];
  if (!body || typeof body !== "object" || (body as any).object !== "whatsapp_business_account") return out;
  const entries = Array.isArray((body as any).entry) ? (body as any).entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field !== "messages") continue;
      const value = change.value || {};
      const phoneNumberId = str(value.metadata?.phone_number_id);
      if (ownPhoneNumberId && phoneNumberId !== ownPhoneNumberId) continue;
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const id = str(st?.id);
        const status = str(st?.status);
        if (!id || !STATES.has(status)) continue;
        const err = Array.isArray(st?.errors) ? st.errors[0] : null;
        out.push({
          id,
          status: status as MetaDeliveryState,
          recipientDigits: str(st?.recipient_id).replace(/\D/g, ""),
          timestamp: Number(st?.timestamp) || 0,
          errorCode: err && typeof err.code === "number" ? err.code : null,
          errorTitle: err ? str(err.title || err.message).slice(0, 120) || null : null,
        });
      }
    }
  }
  return out;
}
