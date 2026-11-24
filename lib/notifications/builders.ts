// What each admin notification says. Pure functions: no database, no network, easy to test.
// Each returns the fields notifyAdmin() stores. href is always a page inside the OS.

import { CHANNELS, type InboxChannelId } from "@/lib/inbox/channels"

export type NotificationSeverity = "INFO" | "ACTION" | "CRITICAL"

export interface NotificationDraft {
  type: string
  severity: NotificationSeverity
  title: string
  body?: string
  href?: string
  /** Unread notifications with the same key collapse into one row (count goes up). */
  groupKey?: string
  propertyId?: string | null
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { INFO: 0, ACTION: 1, CRITICAL: 2 }

export function higherSeverity(a: string, b: string): NotificationSeverity {
  const ra = SEVERITY_RANK[a as NotificationSeverity] ?? 0
  const rb = SEVERITY_RANK[b as NotificationSeverity] ?? 0
  return (rb > ra ? b : a) as NotificationSeverity
}

export function clip(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t
}

/** Only paths inside the OS are allowed as a notification link. */
export function safeHref(href: string | null | undefined): string | null {
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/\\") || /[\u0000-\u001f\\]/.test(href)) return null
  return href.slice(0, 300)
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "")
}

function shortPhone(phone: string): string {
  return phone.replace(/^whatsapp:/i, "").trim()
}

function day(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
}

/** A guest, lead or unknown number wrote on WhatsApp (staff commands like ACCEPT are not included). */
export function whatsappMessage(input: { from: string; text: string }): NotificationDraft {
  const phone = shortPhone(input.from)
  return {
    type: "WHATSAPP_MESSAGE",
    severity: "ACTION",
    title: `New WhatsApp message · ${phone}`,
    body: clip(input.text, 200) || "(media message)",
    href: "/inbox",
    groupKey: `wa:${digits(phone)}`,
  }
}

/** A guest message arrived by email from an OTA (Airbnb, Booking.com, Agoda...) or plain email. */
export function otaMessage(input: { channel: InboxChannelId; guestName?: string | null; body: string; conversationId: string; propertyId?: string | null }): NotificationDraft {
  const label = CHANNELS[input.channel]?.label ?? "Email"
  const who = input.guestName?.trim() || "a guest"
  return {
    type: "OTA_MESSAGE",
    severity: "ACTION",
    title: `New ${label} message from ${who}`,
    body: clip(input.body, 200),
    href: "/inbox",
    groupKey: `inbox:${input.conversationId}`,
    propertyId: input.propertyId ?? null,
  }
}

export interface BookingFacts {
  guestName: string
  unitName: string
  propertyName?: string | null
  checkIn: Date
  checkOut: Date
  source: string
  totalAmount?: number | null
  propertyId?: string | null
}

function bookingLine(b: BookingFacts): string {
  const parts = [`${day(b.checkIn)} → ${day(b.checkOut)}`, b.source]
  if (b.totalAmount && b.totalAmount > 0) parts.push(`₹${Math.round(b.totalAmount).toLocaleString("en-IN")}`)
  return parts.filter(Boolean).join(" · ")
}

export function bookingCreated(b: BookingFacts): NotificationDraft {
  return {
    type: "BOOKING_CREATED",
    severity: "INFO",
    title: `New booking · ${b.guestName} · ${b.unitName}`,
    body: bookingLine(b),
    href: "/reservations",
    propertyId: b.propertyId ?? null,
  }
}

export function bookingCancelled(b: BookingFacts): NotificationDraft {
  return {
    type: "BOOKING_CANCELLED",
    severity: "ACTION",
    title: `Booking cancelled · ${b.guestName} · ${b.unitName}`,
    body: bookingLine(b),
    href: "/reservations",
    propertyId: b.propertyId ?? null,
  }
}

export function ticketCreated(t: { ticketId: string; description: string; priority: string; category?: string | null; unitName?: string | null; propertyId?: string | null }): NotificationDraft {
  const urgent = t.priority === "CRITICAL" || t.priority === "URGENT"
  const where = t.unitName ? ` · ${t.unitName}` : ""
  return {
    type: "TICKET_CREATED",
    severity: urgent ? "CRITICAL" : "ACTION",
    title: `New guest request${where} · ${t.priority.toLowerCase()} priority`,
    body: clip(t.description, 200),
    href: "/operations",
    groupKey: `ticket:${t.ticketId}`,
    propertyId: t.propertyId ?? null,
  }
}

export function slaBreached(t: { ticketId: string; description: string; priority: string; unitName?: string | null }): NotificationDraft {
  return {
    type: "SLA_BREACHED",
    severity: "CRITICAL",
    title: `SLA missed${t.unitName ? ` · ${t.unitName}` : ""} · ${t.priority.toLowerCase()} priority`,
    body: clip(t.description, 200),
    href: "/operations",
    groupKey: `sla:${t.ticketId}`,
  }
}

export function pointsRedeemed(p: { guestName?: string | null; pointsRedeemed: number; rupeeDiscount: number }): NotificationDraft {
  return {
    type: "POINTS_REDEEMED",
    severity: "ACTION",
    title: `Points redeemed${p.guestName ? ` · ${p.guestName}` : ""}`,
    body: `${p.pointsRedeemed} points for ₹${Math.round(p.rupeeDiscount).toLocaleString("en-IN")} off. Deduct it from the walk-in bill.`,
    href: "/operations",
  }
}

export function agreementSigned(a: { guestName: string; bookingId: string }): NotificationDraft {
  return {
    type: "LONG_STAY_SIGNED",
    severity: "INFO",
    title: `Long stay agreement signed · ${a.guestName}`,
    body: "The guest signed. The signed copy is on the booking.",
    href: "/long-stay",
    groupKey: `signed:${a.bookingId}`,
  }
}

export function syncFailed(error: string | null | undefined): NotificationDraft {
  return {
    type: "SYNC_FAILED",
    severity: "CRITICAL",
    title: "IntelliStay booking sync failed",
    body: clip(error, 200) || "New bookings may be missing until the sync works again.",
    href: "/reservations",
    groupKey: "sync-failed",
  }
}
