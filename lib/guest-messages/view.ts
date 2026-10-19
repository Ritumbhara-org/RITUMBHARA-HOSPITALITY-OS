// Grouping, filtering and sorting for the Guest Messages section of the Leads page (client-safe, pure functions).
// The rules mirror the website's Week 7 queue: a READY message may be sent from its Scheduled Date up to and including
// its Send By date (India dates). After Send By it must NOT be sent late (the next daily run marks it SKIPPED).

import { type GuestMessage } from "./types"

// send_now:  READY and today is within Scheduled Date .. Send By -> the team should send it today
// attention: FAILED (e.g. no guest phone) or a status the Sheet holds that is not one of the five
// upcoming:  QUEUED, or READY before its Scheduled Date
// missed:    READY / QUEUED / FAILED whose Send By date has passed -> do not send
// done:      SENT or SKIPPED
export type GuestMessagePhase = "send_now" | "attention" | "upcoming" | "missed" | "done"

export type GuestMessageFilter = "ACTION" | "UPCOMING" | "DONE" | "ALL"

export const GUEST_MESSAGE_FILTER_LABELS: Record<GuestMessageFilter, string> = {
  ACTION: "Needs action",
  UPCOMING: "Upcoming",
  DONE: "Sent / skipped",
  ALL: "All",
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// India date "yyyy-MM-dd" for an instant.
export function istDay(ms: number): string {
  return new Date(ms + 330 * 60000).toISOString().slice(0, 10)
}

function isDay(s: string): boolean {
  return ISO_DAY.test(s)
}

export function guestMessagePhase(m: GuestMessage, today: string): GuestMessagePhase {
  if (m.status === "SENT" || m.status === "SKIPPED") return "done"
  if (m.status === null) return "attention"
  if (isDay(m.sendBy) && today > m.sendBy) return "missed"
  if (m.status === "FAILED") return "attention"
  if (m.status === "READY") return !isDay(m.scheduledDate) || today >= m.scheduledDate ? "send_now" : "upcoming"
  return "upcoming" // QUEUED
}

export function matchesFilter(phase: GuestMessagePhase, filter: GuestMessageFilter): boolean {
  switch (filter) {
    case "ACTION": return phase === "send_now" || phase === "attention"
    case "UPCOMING": return phase === "upcoming"
    case "DONE": return phase === "done" || phase === "missed"
    default: return true
  }
}

const PHASE_ORDER: Record<GuestMessagePhase, number> = { send_now: 0, attention: 1, upcoming: 2, missed: 3, done: 4 }

// Send-now first (earliest Send By first), then problems, then upcoming (soonest first), then the history (newest first).
export function sortGuestMessages(messages: GuestMessage[], today: string): GuestMessage[] {
  return messages
    .map((m, i) => ({ m, i, p: guestMessagePhase(m, today) }))
    .sort((a, b) => {
      if (a.p !== b.p) return PHASE_ORDER[a.p] - PHASE_ORDER[b.p]
      const ka = a.p === "send_now" ? a.m.sendBy : a.m.scheduledDate
      const kb = b.p === "send_now" ? b.m.sendBy : b.m.scheduledDate
      if (ka !== kb) return a.p === "missed" || a.p === "done" ? (ka < kb ? 1 : -1) : (ka < kb ? -1 : 1)
      return a.i - b.i
    })
    .map((x) => x.m)
}

export function countGuestMessages(messages: GuestMessage[], today: string): Record<GuestMessagePhase, number> {
  const counts: Record<GuestMessagePhase, number> = { send_now: 0, attention: 0, upcoming: 0, missed: 0, done: 0 }
  for (const m of messages) counts[guestMessagePhase(m, today)]++
  return counts
}

// WhatsApp link that opens a chat with the message typed in. A person still has to press send: nothing is sent here.
export function whatsAppDraftLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 8) return null
  return "https://wa.me/" + digits + (message ? "?text=" + encodeURIComponent(message) : "")
}
