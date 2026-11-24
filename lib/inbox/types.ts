import type { InboxChannelId } from "./channels";

export interface InboxReservationSummary {
  id: string;
  unitName: string | null;
  propertyName: string | null;
  propertyAddress: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  source: string;
  totalAmount: number;
  notes: string | null;
}

export interface InboxConversationSummary {
  /** "wa:+91…" for WhatsApp threads, otherwise the InboxConversation id. */
  key: string;
  channel: InboxChannelId;
  guestName: string;
  contact: string | null;
  subject: string | null;
  preview: string;
  lastMessageAt: string;
  unread: boolean;
  status: "OPEN" | "CLOSED";
  assignee: { id: string; name: string } | null;
  propertyId: string | null;
  reservation: InboxReservationSummary | null;
}

export interface InboxMessageView {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  at: string;
  senderName: string | null;
  status: string;
}

export interface InboxThread {
  conversation: InboxConversationSummary;
  messages: InboxMessageView[];
  canReply: boolean;
  /** Shown above the reply box when sending from the OS isn't possible. */
  replyNote: string | null;
  extranetUrl: string | null;
}

export type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string };
