// Week 7 Guest Messages on the Leads page. SERVER-ONLY.
//
// Reading: the "Guest Messages" tab of the website's leads Google Sheet, through the SAME server-side Google Sheets
// client and credentials as the Leads tab (lib/leads: Vercel OIDC -> Workload Identity, no key). Read-only: this
// module never writes to the Sheet through the Sheets API.
//
// "Mark as sent": goes through the website's existing Week 7 Apps Script web app (type "guest_message_sent"), which
// owns the queue rules: it only moves one READY message to SENT and stamps "Status Updated (IST)", under its script
// lock. It uses its own secret (GUEST_MESSAGES_STATUS_SECRET), so the OS cannot create or rewrite queue rows.
// Server env (never NEXT_PUBLIC_): GUEST_MESSAGES_SINK_URL (the Apps Script /exec URL) + GUEST_MESSAGES_STATUS_SECRET.
//
// Nothing here sends a WhatsApp message, plans messages or touches bookings.

import { getLeadsConfig, sheetsApiFromConfig, type ConfigResult, type LeadsConfig } from "@/lib/leads/service"
import { SheetsRequestError, type CellValue, type Grid, type SheetsApi } from "@/lib/leads/google-sheets"
import {
  GUEST_MESSAGES_TAB, GUEST_MESSAGE_ID_PATTERN, canonicalGuestMessageStatus,
  type GuestMessage, type GuestMessagesLoadResult, type MarkGuestMessageSentResult,
} from "./types"
import { istDay } from "./view"

if (typeof window !== "undefined") {
  throw new Error("lib/guest-messages/service is server-only and must not be imported in browser code.")
}

// ---------- reading ----------

function quoteTab(tab: string): string {
  return "'" + tab.replace(/'/g, "''") + "'"
}

function headerIndex(row: CellValue[] | undefined): Map<string, number> {
  const index = new Map<string, number>()
  ;(row || []).forEach((v, i) => {
    const name = String(v).trim()
    if (name && !index.has(name)) index.set(name, i)
  })
  return index
}

function cellText(row: CellValue[], index: Map<string, number>, header: string): string {
  const i = index.get(header)
  if (i === undefined || row[i] === undefined || row[i] === null) return ""
  return String(row[i]).trim().replace(/^'/, "")
}

// A date cell as "yyyy-MM-dd": Sheets date serials (unformatted) are converted, "yyyy-MM-dd..." text is kept,
// anything else falls back to the cell as shown in the Sheet.
function dayText(raw: CellValue | undefined, shown: string): string {
  if (typeof raw === "number" && isFinite(raw) && raw > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000).toISOString().slice(0, 10)
  }
  const m = String(raw === undefined ? "" : raw).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : shown
}

// The Guest Messages tab (formatted grid for display + unformatted grid for dates) -> messages. Rows without a valid
// Message ID (blank rows, notes the team typed) are ignored.
export function parseGuestMessageRows(formatted: Grid, unformatted: Grid): GuestMessage[] {
  if (!formatted.length) return []
  const index = headerIndex(formatted[0])
  const idCol = index.has("Message ID") ? (index.get("Message ID") as number) : 1
  const out: GuestMessage[] = []
  for (let r = 1; r < formatted.length; r++) {
    const row = formatted[r] || []
    const raw = unformatted[r] || []
    const id = String(row[idCol] === undefined ? "" : row[idCol]).trim()
    if (!GUEST_MESSAGE_ID_PATTERN.test(id)) continue
    const text = (h: string) => cellText(row, index, h)
    const day = (h: string) => {
      const i = index.get(h)
      return i === undefined ? "" : dayText(raw[i], text(h))
    }
    const statusText = text("Status")
    out.push({
      id,
      row: r + 1,
      status: canonicalGuestMessageStatus(statusText),
      statusText,
      type: text("Type"),
      bookingId: text("Booking ID"),
      bookingCode: text("Booking Code"),
      guest: text("Guest"),
      guestPhone: text("Guest WhatsApp"),
      property: text("Property"),
      checkIn: day("Check-in"),
      checkOut: day("Check-out"),
      nights: text("Nights"),
      guests: text("Guests"),
      scheduledDate: day("Scheduled Date"),
      sendBy: day("Send By"),
      reason: text("Reason"),
      message: (() => {
        const i = index.get("Message")
        return i === undefined || row[i] === undefined ? "" : String(row[i]).replace(/^'/, "")
      })(),
      created: text("Created (IST)"),
      statusUpdated: text("Status Updated (IST)"),
    })
  }
  return out
}

export interface ListGuestMessagesResult {
  messages: GuestMessage[]
  tabGid: number | null
  tabMissing: boolean
}

export async function listGuestMessages(api: SheetsApi): Promise<ListGuestMessagesResult> {
  const meta = await api.getMeta()
  const tab = meta.tabs.find((t) => t.title === GUEST_MESSAGES_TAB)
  if (!tab) return { messages: [], tabGid: null, tabMissing: true }
  const range = quoteTab(GUEST_MESSAGES_TAB)
  const [formatted, unformatted] = await Promise.all([
    api.batchGet([range], "FORMATTED_VALUE"),
    api.batchGet([range], "UNFORMATTED_VALUE"),
  ])
  return { messages: parseGuestMessageRows(formatted[0] || [], unformatted[0] || []), tabGid: tab.sheetId, tabMissing: false }
}

// ---------- "mark as sent" bridge (OS server -> website Apps Script) ----------

export const STATUS_SECRET_MIN_LENGTH = 32
const APPS_SCRIPT_PREFIX = "https://script.google.com/macros/s/"
const BRIDGE_TIMEOUT_MS = 15000

export interface GuestMessageStatusConfig {
  url: string
  secret: string
}

export function getGuestMessageStatusConfig(
  env: Record<string, string | undefined> = process.env,
): { ok: true; config: GuestMessageStatusConfig } | { ok: false; missing: string[] } {
  const missing: string[] = []
  const url = String(env.GUEST_MESSAGES_SINK_URL || "").trim()
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) missing.push("GUEST_MESSAGES_SINK_URL")
  const secret = String(env.GUEST_MESSAGES_STATUS_SECRET || "")
  if (secret.trim().length < STATUS_SECRET_MIN_LENGTH) missing.push("GUEST_MESSAGES_STATUS_SECRET")
  return missing.length ? { ok: false, missing } : { ok: true, config: { url, secret } }
}

const NOT_CONNECTED = "Marking messages as sent from the OS is not connected yet. Set Status to SENT in the Guest Messages tab of the Sheet instead."

// Asks the Apps Script to mark one READY message SENT. The secret travels only in the POST body to script.google.com.
// Replies from Google are never logged or returned as-is.
export async function markGuestMessageSent(
  config: GuestMessageStatusConfig,
  messageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarkGuestMessageSentResult> {
  if (!GUEST_MESSAGE_ID_PATTERN.test(messageId)) return { success: false, code: "invalid_input", error: "That message ID is not valid." }
  if (config.url.indexOf(APPS_SCRIPT_PREFIX) !== 0) return { success: false, code: "not_configured", error: NOT_CONNECTED }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS)
  let reply: { ok?: unknown; updated?: unknown; unchanged?: unknown; statusUpdated?: unknown; error?: unknown; code?: unknown; status?: unknown }
  try {
    let res: Response
    try {
      res = await fetchImpl(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "guest_message_sent", secret: config.secret, messageId }),
        redirect: "follow", // Apps Script answers with a redirect to script.googleusercontent.com
        cache: "no-store",
        signal: controller.signal,
      })
    } catch {
      return { success: false, code: "save_failed", error: "The Google Sheet did not answer. Refresh the page to check the status, then try again if needed." }
    }
    if (!res.ok) return { success: false, code: "save_failed", error: "The Google Sheet could not be updated (HTTP " + res.status + "). Refresh the page and try again." }
    try {
      reply = JSON.parse(await res.text())
    } catch {
      return { success: false, code: "save_failed", error: "The Apps Script sent an unexpected reply. Check that its latest version is deployed, or set SENT in the Sheet." }
    }
  } finally {
    clearTimeout(timer)
  }

  if (!reply || typeof reply !== "object") return { success: false, code: "save_failed", error: "The Apps Script sent an unexpected reply." }
  if (reply.ok === true && reply.status === "SENT") {
    return { success: true, unchanged: reply.unchanged === true, statusUpdated: typeof reply.statusUpdated === "string" ? reply.statusUpdated : "" }
  }
  const code = String(reply.code || "")
  if (reply.error === "conflict") {
    const current = typeof reply.status === "string" ? reply.status : ""
    return { success: false, code: "conflict", currentStatus: current, error: "This message is " + (current || "no longer READY") + " in the Sheet, so it was not marked as sent. The page now shows the latest status." }
  }
  if (reply.error === "not_found") return { success: false, code: "not_found", error: "This message was not found in the Guest Messages tab. Refresh the page." }
  if (reply.error === "busy") return { success: false, code: "busy", error: "The Sheet is busy. Try again in a few seconds." }
  if (code === "AUTH" || code === "NO_SECRET_PROPERTY") {
    return { success: false, code: "not_configured", error: "The Apps Script did not accept the OS. Check that GUEST_MESSAGES_STATUS_SECRET is the same in the OS and in the Apps Script, and that its latest version is deployed." }
  }
  return { success: false, code: "save_failed", error: "The message could not be marked as sent. Check the Apps Script deployment, or set SENT in the Sheet." }
}

// ---------- page loader ----------

export interface LoadGuestMessagesDeps {
  getConfig?: () => ConfigResult
  createApi?: (config: LeadsConfig) => SheetsApi
  env?: Record<string, string | undefined>
  now?: () => number
  log?: (event: string, detail?: Record<string, unknown>) => void
}

export async function loadGuestMessages(deps: LoadGuestMessagesDeps = {}): Promise<GuestMessagesLoadResult> {
  const now = deps.now ? deps.now() : Date.now()
  const log = deps.log || ((event, detail) => console.error("[guest-messages] " + event, detail || ""))
  const cfg = (deps.getConfig || getLeadsConfig)()
  if (!cfg.ok) return { ok: false, code: "not_configured", missing: cfg.missing, fetchedAt: now }

  let result: ListGuestMessagesResult
  try {
    result = await listGuestMessages((deps.createApi || sheetsApiFromConfig)(cfg.config))
  } catch (err) {
    const status = err instanceof SheetsRequestError ? err.status : undefined
    log("load_failed", { status })
    const message = err instanceof SheetsRequestError && err.auth
      ? err.message
      : "The guest messages could not be loaded from the Google Sheet. Try again in a minute."
    return { ok: false, code: "load_failed", message, fetchedAt: now }
  }

  return {
    ok: true,
    messages: result.messages,
    sheetUrl: "https://docs.google.com/spreadsheets/d/" + cfg.config.spreadsheetId + "/edit",
    tabGid: result.tabGid,
    tabMissing: result.tabMissing,
    today: istDay(now),
    canMarkSent: getGuestMessageStatusConfig(deps.env || process.env).ok,
    fetchedAt: now,
  }
}
