// Lead types and status rules shared by the server and the Leads page (client-safe: no server imports).
//
// The source of truth for leads is the website's leads Google Sheet, written by the website's Apps Script:
//   "Qualified Leads" - one row per qualified WhatsApp lead (ID column "Lead ID")
//   "Handoffs"        - one row per WhatsApp conversation handed to the team (ID column "Handoff ID")
// ("WhatsApp Clicks" is lead intent with no phone number, not a lead, so it is not shown.)
// The status workflow below is the one the Sheet already uses (Week 6 lead status tracking); it is NOT a new one.

export const LEAD_STATUSES = ["New", "Contacted", "Booked", "Lost"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ["New", "Contacted"]

// Days until the next follow-up after a status change (Booked and Lost: none). Same as the Sheet's rule.
export const FOLLOW_UP_DAYS: Partial<Record<LeadStatus, number>> = { New: 1, Contacted: 2 }

export type LeadKind = "qualified" | "handoff"

export const LEAD_TABS: readonly { kind: LeadKind; tab: string; idHeader: string; label: string }[] = [
  { kind: "qualified", tab: "Qualified Leads", idHeader: "Lead ID", label: "Qualified" },
  { kind: "handoff", tab: "Handoffs", idHeader: "Handoff ID", label: "Handoff" },
]

// Lead/Handoff IDs written by the website (e.g. "L-…", "H-…"). Used to validate input to the update action.
export const LEAD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/

// The canonical status for a cell value ("contacted " -> "Contacted"), or null if it is not one of LEAD_STATUSES.
export function canonicalStatus(value: unknown): LeadStatus | null {
  const s = String(value === null || value === undefined ? "" : value).trim().toLowerCase()
  for (const status of LEAD_STATUSES) if (status.toLowerCase() === s) return status
  return null
}

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value)
}

export interface LeadGuest {
  id: string
  name: string
}

// One lead row, with only the fields that exist in the Sheet. Missing cells are "" (text) or null (numbers/times).
export interface Lead {
  key: string // "<kind>:<id>", unique across both tabs
  kind: LeadKind
  id: string
  row: number // 1-based Sheet row, for the "Open in Sheet" link
  status: LeadStatus | null // null when the cell holds something other than the four statuses
  statusText: string // the cell as it is in the Sheet
  phone: string
  guestName: string // "Guest Name": the verified booking's guest name (Guest Escalation leads); "" when unknown
  bookingCode: string // "Booking Code": the guest's booking (Guest Escalation leads); "" otherwise
  destination: string
  property: string
  checkIn: string
  checkOut: string
  nights: string
  guests: string
  requirements: string
  reason: string // Handoffs only
  source: string
  ref: string
  site: string
  notes: string // Qualified Leads only
  priority: string // Hot / Warm / Cold
  score: number | null
  received: string // "Received (IST)" as shown in the Sheet
  statusUpdated: string
  nextFollowUp: string
  autoFollowUp: string // "Auto Follow-up" (only when that column exists)
  waFollowUpStatus: string // "WA Follow-up Status" (only when that column exists)
  receivedMs: number | null
  checkInMs: number | null
  nextFollowUpMs: number | null
  guest: LeadGuest | null // the OS guest profile with the same phone number, if there is one
}

export type LeadsLoadResult =
  | { ok: true; leads: Lead[]; sheetUrl: string; tabGids: Partial<Record<LeadKind, number>>; fetchedAt: number; missingTabs: string[] }
  | { ok: false; code: "not_configured"; missing: string[]; fetchedAt: number }
  | { ok: false; code: "load_failed"; message: string; fetchedAt: number }

export type UpdateLeadStatusResult =
  | { success: true; unchanged: boolean; status: LeadStatus; statusUpdated: string; nextFollowUp: string; nextFollowUpMs: number | null }
  | { success: false; code: string; error: string; currentStatus?: string }
