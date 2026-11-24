// Search, filter, sort and count logic for the Leads page (client-safe, pure functions).

import { OPEN_LEAD_STATUSES, type Lead, type LeadKind, type LeadStatus } from "./types"

export type StatusFilter = "ALL" | "OPEN" | "DUE" | LeadStatus | "OTHER"
export type KindFilter = "ALL" | LeadKind
export type LeadSort = "newest" | "oldest" | "follow_up" | "check_in" | "score"

export const SORT_LABELS: Record<LeadSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  follow_up: "Follow-up due first",
  check_in: "Check-in soonest",
  score: "Highest score",
}

const IST_OFFSET_MS = 330 * 60000

// End of the current day in India, as epoch ms.
export function endOfTodayIst(nowMs: number): number {
  const istDayStart = Math.floor((nowMs + IST_OFFSET_MS) / 86400000) * 86400000
  return istDayStart + 86400000 - 1 - IST_OFFSET_MS
}

export function isOpen(lead: Lead): boolean {
  return lead.status !== null && OPEN_LEAD_STATUSES.includes(lead.status)
}

// Open lead whose Next Follow-up is today or earlier (India date), the same rule as the Sheet's daily digest.
export function isFollowUpDue(lead: Lead, nowMs: number): boolean {
  return isOpen(lead) && lead.nextFollowUpMs !== null && lead.nextFollowUpMs <= endOfTodayIst(nowMs)
}

function digits(s: string): string {
  return s.replace(/\D/g, "")
}

// What the Guest column shows: the OS guest profile (linked), else the Sheet's "Guest Name" (the name the guest typed to
// the WhatsApp assistant, or the verified booking's name for Guest Escalation leads), else nothing (the page then says
// "No guest profile"). Never invented.
export type GuestDisplay = { kind: "profile"; id: string; name: string } | { kind: "sheet"; name: string } | { kind: "none" }

export function guestDisplay(lead: Lead): GuestDisplay {
  if (lead.guest) return { kind: "profile", id: lead.guest.id, name: lead.guest.name }
  const name = lead.guestName.trim()
  return name ? { kind: "sheet", name } : { kind: "none" }
}

export function matchesSearch(lead: Lead, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const fields = [
    lead.id, lead.phone, lead.destination, lead.property, lead.source, lead.ref, lead.notes,
    lead.requirements, lead.reason, lead.statusText, lead.priority, lead.guest ? lead.guest.name : "",
    lead.guestName, lead.bookingCode,
  ]
  if (fields.some((f) => f.toLowerCase().includes(q))) return true
  const qDigits = digits(q)
  return qDigits.length >= 3 && qDigits.length === q.replace(/[\s+()-]/g, "").length && digits(lead.phone).includes(qDigits)
}

export function matchesStatus(lead: Lead, filter: StatusFilter, nowMs: number): boolean {
  switch (filter) {
    case "ALL": return true
    case "OPEN": return isOpen(lead)
    case "DUE": return isFollowUpDue(lead, nowMs)
    case "OTHER": return lead.status === null
    default: return lead.status === filter
  }
}

function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0
  if (a === null) return 1 // empty values always last
  if (b === null) return -1
  return (a - b) * direction
}

// Received time, falling back to the Sheet row (rows are appended in arrival order).
function arrival(lead: Lead): number {
  return lead.receivedMs !== null ? lead.receivedMs : lead.row
}

export function sortLeads(leads: Lead[], sort: LeadSort): Lead[] {
  const byNewest = (a: Lead, b: Lead) => {
    if (a.receivedMs !== null && b.receivedMs !== null && a.receivedMs !== b.receivedMs) return b.receivedMs - a.receivedMs
    if (a.kind === b.kind) return b.row - a.row
    return arrival(b) - arrival(a)
  }
  const out = leads.slice()
  out.sort((a, b) => {
    let c = 0
    if (sort === "oldest") c = -byNewest(a, b)
    else if (sort === "follow_up") {
      // Open leads with a follow-up date first (earliest first), then everything else newest first.
      const fa = isOpen(a) ? a.nextFollowUpMs : null
      const fb = isOpen(b) ? b.nextFollowUpMs : null
      c = compareNullable(fa, fb, 1)
    } else if (sort === "check_in") c = compareNullable(a.checkInMs, b.checkInMs, 1)
    else if (sort === "score") c = compareNullable(a.score, b.score, -1)
    return c !== 0 ? c : byNewest(a, b)
  })
  return out
}

export interface LeadFilters {
  query: string
  status: StatusFilter
  kind: KindFilter
  sort: LeadSort
}

export function visibleLeads(leads: Lead[], filters: LeadFilters, nowMs: number): Lead[] {
  return sortLeads(
    leads.filter((l) =>
      (filters.kind === "ALL" || l.kind === filters.kind) &&
      matchesStatus(l, filters.status, nowMs) &&
      matchesSearch(l, filters.query)),
    filters.sort,
  )
}

export interface LeadCounts {
  total: number
  open: number
  due: number
  New: number
  Contacted: number
  Booked: number
  Lost: number
  other: number
}

export function countLeads(leads: Lead[], nowMs: number): LeadCounts {
  const c: LeadCounts = { total: leads.length, open: 0, due: 0, New: 0, Contacted: 0, Booked: 0, Lost: 0, other: 0 }
  for (const l of leads) {
    if (l.status === null) c.other++
    else c[l.status]++
    if (isOpen(l)) c.open++
    if (isFollowUpDue(l, nowMs)) c.due++
  }
  return c
}
