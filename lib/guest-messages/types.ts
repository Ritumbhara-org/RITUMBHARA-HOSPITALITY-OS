// Week 7 Guest Messages: types shared by the server and the Leads page (client-safe: no server imports).
//
// The source of truth is the "Guest Messages" tab of the website's leads Google Sheet. The website
// (ritumbhara-live-v4, /api/guest-messages/run) plans pre-arrival, check-in and checkout messages from Intellistay TEST
// bookings and its Apps Script writes them there. The OS only SHOWS them; it never creates, plans or sends messages.
// The team sends each message by hand on WhatsApp and then marks it SENT. These are NOT leads.

export const GUEST_MESSAGES_TAB = "Guest Messages"

export const GUEST_MESSAGE_STATUSES = ["QUEUED", "READY", "SENT", "SKIPPED", "FAILED"] as const
export type GuestMessageStatus = (typeof GUEST_MESSAGE_STATUSES)[number]

// Message IDs written by the website's Apps Script: "GM-" + 12 upper-case hex characters.
export const GUEST_MESSAGE_ID_PATTERN = /^GM-[0-9A-F]{12}$/

export const GUEST_MESSAGE_TYPE_LABELS: Record<string, string> = {
  PRE_ARRIVAL: "Pre-arrival",
  CHECK_IN: "Check-in",
  CHECKOUT: "Checkout",
}

export function canonicalGuestMessageStatus(value: unknown): GuestMessageStatus | null {
  const s = String(value === null || value === undefined ? "" : value).trim().toUpperCase()
  return (GUEST_MESSAGE_STATUSES as readonly string[]).includes(s) ? (s as GuestMessageStatus) : null
}

// One row of the Guest Messages tab, with only the columns the Apps Script writes. Missing cells are "".
// Dates (check-in, check-out, scheduled, send by) are "yyyy-MM-dd" when the cell holds a real date, else the cell text.
export interface GuestMessage {
  id: string
  row: number // 1-based Sheet row, for the "Open row in Sheet" link
  status: GuestMessageStatus | null // null when the cell holds something else
  statusText: string
  type: string // PRE_ARRIVAL | CHECK_IN | CHECKOUT (as written by the website)
  bookingId: string
  bookingCode: string
  guest: string // guest first name, as the website wrote it
  guestPhone: string // E.164 without the Sheet's leading apostrophe
  property: string
  checkIn: string
  checkOut: string
  nights: string
  guests: string
  scheduledDate: string
  sendBy: string
  reason: string
  message: string
  created: string
  statusUpdated: string
}

export type GuestMessagesLoadResult =
  | {
      ok: true
      messages: GuestMessage[]
      sheetUrl: string
      tabGid: number | null
      tabMissing: boolean
      today: string // India date "yyyy-MM-dd" the page was loaded on
      canMarkSent: boolean // true when the OS -> Apps Script "mark as sent" bridge is configured (no secret is sent to the browser)
      fetchedAt: number
    }
  | { ok: false; code: "not_configured"; missing: string[]; fetchedAt: number }
  | { ok: false; code: "load_failed"; message: string; fetchedAt: number }

export type MarkGuestMessageSentResult =
  | { success: true; unchanged: boolean; statusUpdated: string }
  | { success: false; code: string; error: string; currentStatus?: string }
