// Channel metadata shared by the server and the inbox UI. No server-only imports here.

export type InboxChannelId = "WHATSAPP" | "AIRBNB" | "BOOKING_COM" | "AGODA" | "EXPEDIA" | "EMAIL";

export interface ChannelMeta {
  id: InboxChannelId;
  label: string;
  short: string;
  /** Tailwind classes for the small channel badge. */
  badge: string;
  /** Where the team can reply by hand if sending from the OS isn't possible. */
  extranetUrl?: string;
}

export const CHANNELS: Record<InboxChannelId, ChannelMeta> = {
  WHATSAPP: { id: "WHATSAPP", label: "WhatsApp", short: "WA", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  AIRBNB: { id: "AIRBNB", label: "Airbnb", short: "Airbnb", badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400", extranetUrl: "https://www.airbnb.com/hosting/messages" },
  BOOKING_COM: { id: "BOOKING_COM", label: "Booking.com", short: "B.com", badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400", extranetUrl: "https://admin.booking.com" },
  AGODA: { id: "AGODA", label: "Agoda", short: "Agoda", badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400", extranetUrl: "https://ycs.agoda.com" },
  EXPEDIA: { id: "EXPEDIA", label: "Expedia", short: "Expedia", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400", extranetUrl: "https://apps.expediapartnercentral.com" },
  EMAIL: { id: "EMAIL", label: "Email", short: "Email", badge: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

export const CHANNEL_ORDER: InboxChannelId[] = ["WHATSAPP", "AIRBNB", "BOOKING_COM", "AGODA", "EXPEDIA", "EMAIL"];

/** Channels whose messages arrive as forwarded OTA notification emails and are replied to by email. */
export const EMAIL_BASED_CHANNELS: InboxChannelId[] = ["AIRBNB", "BOOKING_COM", "AGODA", "EXPEDIA", "EMAIL"];
