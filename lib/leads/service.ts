// Leads service: reads leads from the website's leads Google Sheet and updates their status there. SERVER-ONLY.
//
// The Sheet stays the single source of truth; the OS stores no copy of the leads. Every value is located by
// its header NAME (like the website's Apps Script does), so columns the team adds or reorders are never touched.
//
// Status update = exactly what the Sheet's own "on edit" trigger (onLeadStatusEdit) does when the team picks a
// status by hand. That trigger does not run for API edits, so the same three cells are written here:
//   Status               -> the new status
//   Status Updated (IST) -> now, "yyyy-MM-dd HH:mm:ss" in IST
//   Next Follow-up       -> New: now + 1 day, Contacted: now + 2 days, Booked / Lost: empty
// Nothing else in the row changes (Score, Priority and the WA Follow-up columns are left to the Apps Script).

import {
  FOLLOW_UP_DAYS,
  LEAD_ID_PATTERN,
  LEAD_TABS,
  canonicalStatus,
  isLeadStatus,
  type Lead,
  type LeadKind,
  type LeadStatus,
  type LeadsLoadResult,
  type UpdateLeadStatusResult,
} from "./types"
import { createGoogleSheetsApi, SheetsRequestError, type CellValue, type Grid, type SheetsApi } from "./google-sheets"

if (typeof window !== "undefined") {
  throw new Error("lib/leads/service is server-only and must not be imported in browser code.")
}

const IST_OFFSET_MINUTES = 330
const DAY_MS = 86400000

export const STATUS_HEADER = "Status"
export const STATUS_UPDATED_HEADER = "Status Updated (IST)"
export const NEXT_FOLLOW_UP_HEADER = "Next Follow-up"

// ---------- configuration ----------

export interface LeadsConfig {
  spreadsheetId: string
  clientEmail: string
  privateKey: string
}

export type ConfigResult = { ok: true; config: LeadsConfig } | { ok: false; missing: string[] }

// Accepts the bare Sheet ID or a pasted Sheet URL (same rule as the Apps Script's LEADS_SHEET_ID).
export function parseSheetId(raw: string | undefined): string | null {
  const value = String(raw || "").trim()
  if (!value) return null
  const fromUrl = value.match(/\/d\/([A-Za-z0-9_-]+)/)
  const id = fromUrl ? fromUrl[1] : value
  return /^[A-Za-z0-9_-]{25,100}$/.test(id) ? id : null
}

export function getLeadsConfig(env: Record<string, string | undefined> = process.env): ConfigResult {
  const missing: string[] = []
  const spreadsheetId = parseSheetId(env.LEADS_SHEET_ID)
  const clientEmail = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim()
  // Private keys pasted into env settings usually carry literal "\n" sequences instead of line breaks.
  const privateKey = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim()
  if (!spreadsheetId) missing.push("LEADS_SHEET_ID")
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientEmail)) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL")
  if (!privateKey.includes("PRIVATE KEY")) missing.push("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
  if (missing.length || !spreadsheetId) return { ok: false, missing }
  return { ok: true, config: { spreadsheetId, clientEmail, privateKey } }
}

export function sheetsApiFromConfig(config: LeadsConfig): SheetsApi {
  return createGoogleSheetsApi({
    spreadsheetId: config.spreadsheetId,
    account: { clientEmail: config.clientEmail, privateKey: config.privateKey },
  })
}

// ---------- time helpers (IST, like the Sheet) ----------

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n)
}

// "yyyy-MM-dd HH:mm:ss" in IST, the format of every timestamp the website's Apps Script writes.
export function istText(date: Date): string {
  const d = new Date(date.getTime() + IST_OFFSET_MINUTES * 60000)
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " +
    pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds())
}

export function nextFollowUpFor(status: LeadStatus, from: Date): string {
  const days = FOLLOW_UP_DAYS[status]
  return days ? istText(new Date(from.getTime() + days * DAY_MS)) : ""
}

// Minutes the time zone is ahead of UTC at `instantMs` (handles any zone the Sheet might be set to).
export function timeZoneOffsetMinutes(timeZone: string, instantMs: number): number {
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") return IST_OFFSET_MINUTES
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(instantMs))
    const get = (t: string) => Number((parts.find((p) => p.type === t) || { value: "0" }).value)
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
    return Math.round((wall - Math.floor(instantMs / 1000) * 1000) / 60000)
  } catch {
    return IST_OFFSET_MINUTES
  }
}

// A date/time cell (unformatted value) as epoch ms. Sheets returns real dates as serial numbers in the Sheet's
// time zone; cells that stayed text are read as "yyyy-MM-dd[ HH:mm[:ss]]" in IST (how Apps Script writes them).
export function cellTimeMs(value: CellValue | undefined, timeZone: string): number | null {
  if (typeof value === "number" && isFinite(value) && value > 0) {
    const wallMs = Math.round((value - 25569) * DAY_MS)
    return wallMs - timeZoneOffsetMinutes(timeZone, wallMs) * 60000
  }
  const m = String(value === undefined ? "" : value).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - IST_OFFSET_MINUTES * 60000
  return isNaN(ms) ? null : ms
}

// ---------- reading ----------

function quoteTab(tab: string): string {
  return "'" + tab.replace(/'/g, "''") + "'"
}

// Column number (1-based) -> A1 letters.
export function columnLetter(col: number): string {
  let s = ""
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function headerIndex(row: CellValue[] | undefined): Map<string, number> {
  const index = new Map<string, number>()
  ;(row || []).forEach((v, i) => {
    const name = String(v).trim()
    if (name && !index.has(name)) index.set(name, i)
  })
  return index
}

function text(row: CellValue[], index: Map<string, number>, header: string): string {
  const i = index.get(header)
  if (i === undefined || row[i] === undefined || row[i] === null) return ""
  return String(row[i]).trim()
}

function numberOrNull(row: CellValue[], index: Map<string, number>, header: string): number | null {
  const i = index.get(header)
  if (i === undefined) return null
  const v = row[i]
  if (typeof v === "number" && isFinite(v)) return v
  const n = Number(String(v === undefined ? "" : v).trim())
  return String(v === undefined ? "" : v).trim() !== "" && isFinite(n) ? n : null
}

// Turns one tab (formatted grid for display + unformatted grid for dates/numbers) into leads.
export function parseLeadRows(
  kind: LeadKind,
  formatted: Grid,
  unformatted: Grid,
  timeZone: string,
): Lead[] {
  const def = LEAD_TABS.find((t) => t.kind === kind)
  if (!def || !formatted.length) return []
  const index = headerIndex(formatted[0])
  const idCol = index.has(def.idHeader) ? (index.get(def.idHeader) as number) : 1 // Apps Script: IDs are column B
  const leads: Lead[] = []
  for (let r = 1; r < formatted.length; r++) {
    const row = formatted[r] || []
    const raw = unformatted[r] || []
    const id = String(row[idCol] === undefined ? "" : row[idCol]).trim()
    if (!id) continue
    const statusText = text(row, index, STATUS_HEADER)
    const timeAt = (header: string) => {
      const i = index.get(header)
      return i === undefined ? null : cellTimeMs(raw[i], timeZone)
    }
    leads.push({
      key: kind + ":" + id,
      kind,
      id,
      row: r + 1,
      status: canonicalStatus(statusText),
      statusText,
      phone: text(row, index, "Phone").replace(/^'/, ""),
      destination: text(row, index, "Destination"),
      property: text(row, index, "Property"),
      checkIn: text(row, index, "Check-in"),
      checkOut: text(row, index, "Check-out"),
      nights: text(row, index, "Nights"),
      guests: text(row, index, "Guests"),
      requirements: text(row, index, "Requirements"),
      reason: text(row, index, "Reason"),
      source: text(row, index, "Source"),
      ref: text(row, index, "Ref"),
      site: text(row, index, "Site"),
      notes: text(row, index, "Notes"),
      priority: text(row, index, "Priority"),
      score: numberOrNull(raw.length ? raw : row, index, "Score"),
      received: text(row, index, "Received (IST)"),
      statusUpdated: text(row, index, STATUS_UPDATED_HEADER),
      nextFollowUp: text(row, index, NEXT_FOLLOW_UP_HEADER),
      autoFollowUp: text(row, index, "Auto Follow-up"),
      waFollowUpStatus: text(row, index, "WA Follow-up Status"),
      receivedMs: timeAt("Received (IST)"),
      checkInMs: timeAt("Check-in"),
      nextFollowUpMs: timeAt(NEXT_FOLLOW_UP_HEADER),
      guest: null,
    })
  }
  return leads
}

export interface ListLeadsResult {
  leads: Lead[]
  tabGids: Partial<Record<LeadKind, number>>
  missingTabs: string[]
}

// All leads from both tabs. A tab that does not exist yet is reported, not treated as an error.
export async function listLeads(api: SheetsApi): Promise<ListLeadsResult> {
  const meta = await api.getMeta()
  const present = LEAD_TABS.filter((t) => meta.tabs.some((m) => m.title === t.tab))
  const missingTabs = LEAD_TABS.filter((t) => !present.includes(t)).map((t) => t.tab)
  const ranges = present.map((t) => quoteTab(t.tab))
  const [formatted, unformatted] = await Promise.all([
    api.batchGet(ranges, "FORMATTED_VALUE"),
    api.batchGet(ranges, "UNFORMATTED_VALUE"),
  ])
  const tabGids: Partial<Record<LeadKind, number>> = {}
  const leads: Lead[] = []
  present.forEach((t, i) => {
    const tab = meta.tabs.find((m) => m.title === t.tab)
    if (tab) tabGids[t.kind] = tab.sheetId
    leads.push(...parseLeadRows(t.kind, formatted[i] || [], unformatted[i] || [], meta.timeZone))
  })
  return { leads, tabGids, missingTabs }
}

// ---------- status update ----------

export class LeadUpdateError extends Error {
  code: string
  currentStatus?: string
  constructor(code: string, message: string, currentStatus?: string) {
    super(message)
    this.name = "LeadUpdateError"
    this.code = code
    this.currentStatus = currentStatus
  }
}

export interface UpdateLeadStatusInput {
  kind: LeadKind
  id: string
  status: LeadStatus
  // The status the team member saw before changing it. If the Sheet now holds something else (someone changed
  // it in the meantime), nothing is written and the current value is returned instead.
  expectedStatus?: string
}

export async function updateLeadStatus(
  api: SheetsApi,
  input: UpdateLeadStatusInput,
  now: Date = new Date(),
): Promise<Extract<UpdateLeadStatusResult, { success: true }>> {
  const def = LEAD_TABS.find((t) => t.kind === input.kind)
  if (!def || !LEAD_ID_PATTERN.test(input.id) || !isLeadStatus(input.status)) {
    throw new LeadUpdateError("invalid_input", "That status change is not valid.")
  }

  const meta = await api.getMeta()
  if (!meta.tabs.some((t) => t.title === def.tab)) {
    throw new LeadUpdateError("not_found", "The \"" + def.tab + "\" tab was not found in the leads Sheet.")
  }
  const [grid] = await api.batchGet([quoteTab(def.tab)], "FORMATTED_VALUE")
  const rows = grid || []
  const index = headerIndex(rows[0])
  const statusCol = index.get(STATUS_HEADER)
  if (statusCol === undefined) throw new LeadUpdateError("sheet_layout", "The leads Sheet has no \"Status\" column.")
  const idCol = index.has(def.idHeader) ? (index.get(def.idHeader) as number) : 1

  const matches: number[] = []
  for (let r = 1; r < rows.length; r++) {
    const cell = rows[r] && rows[r][idCol]
    if (String(cell === undefined ? "" : cell).trim() === input.id) matches.push(r)
  }
  if (!matches.length) throw new LeadUpdateError("not_found", "Lead " + input.id + " was not found in the Sheet. It may have been removed.")
  if (matches.length > 1) throw new LeadUpdateError("duplicate_id", "Lead " + input.id + " appears more than once in the Sheet. Fix it in the Sheet first.")

  const r = matches[0]
  const row = rows[r]
  const currentText = String(row[statusCol] === undefined ? "" : row[statusCol]).trim()
  const current = canonicalStatus(currentText)
  const updatedCol = index.get(STATUS_UPDATED_HEADER)
  const nextCol = index.get(NEXT_FOLLOW_UP_HEADER)
  const cellAt = (col: number | undefined) => (col === undefined || row[col] === undefined ? "" : String(row[col]).trim())

  if (input.expectedStatus !== undefined) {
    const expected = String(input.expectedStatus).trim()
    const same = canonicalStatus(expected) !== null ? canonicalStatus(expected) === current : expected === currentText
    if (!same && current !== input.status) {
      throw new LeadUpdateError("conflict", "Someone else changed this lead to \"" + (currentText || "blank") + "\". The page now shows the latest status.", currentText)
    }
  }

  // Re-selecting the status a lead already has changes nothing (same as the Sheet's trigger).
  if (current === input.status) {
    const nextText = cellAt(nextCol)
    return { success: true, unchanged: true, status: input.status, statusUpdated: cellAt(updatedCol), nextFollowUp: nextText, nextFollowUpMs: cellTimeMs(nextText, "Asia/Kolkata") }
  }

  const sheetRow = r + 1
  const a1 = (col: number) => quoteTab(def.tab) + "!" + columnLetter(col + 1) + sheetRow
  const updatedText = istText(now)
  const nextText = nextFollowUpFor(input.status, now)
  const data: { range: string; values: CellValue[][] }[] = [{ range: a1(statusCol), values: [[input.status]] }]
  if (updatedCol !== undefined) data.push({ range: a1(updatedCol), values: [[updatedText]] })
  if (nextCol !== undefined) data.push({ range: a1(nextCol), values: [[nextText]] })
  await api.batchUpdate(data)

  return {
    success: true,
    unchanged: false,
    status: input.status,
    statusUpdated: updatedCol !== undefined ? updatedText : "",
    nextFollowUp: nextCol !== undefined ? nextText : "",
    nextFollowUpMs: nextCol !== undefined ? cellTimeMs(nextText, "Asia/Kolkata") : null,
  }
}

// ---------- page loader ----------

export interface LoadLeadsDeps {
  getConfig?: () => ConfigResult
  createApi?: (config: LeadsConfig) => SheetsApi
  // Looks up OS guest profiles by phone number (E.164). Failure here never breaks the page.
  findGuestsByPhone?: (phones: string[]) => Promise<{ id: string; name: string; phone: string }[]>
  now?: () => number
  log?: (event: string, detail?: Record<string, unknown>) => void
}

export async function loadLeads(deps: LoadLeadsDeps = {}): Promise<LeadsLoadResult> {
  const now = deps.now ? deps.now() : Date.now()
  const log = deps.log || ((event, detail) => console.error("[leads] " + event, detail || ""))
  const cfg = (deps.getConfig || getLeadsConfig)()
  if (!cfg.ok) return { ok: false, code: "not_configured", missing: cfg.missing, fetchedAt: now }

  let result: ListLeadsResult
  try {
    result = await listLeads((deps.createApi || sheetsApiFromConfig)(cfg.config))
  } catch (err) {
    const status = err instanceof SheetsRequestError ? err.status : undefined
    log("load_failed", { status })
    let message = "The leads could not be loaded from the Google Sheet. Try again in a minute."
    if (status === 403 || status === 404) {
      message = "The OS cannot open the leads Google Sheet. Check LEADS_SHEET_ID and that the Sheet is shared with the service account as an Editor."
    } else if (err instanceof SheetsRequestError && (status === 400 || status === 401 || status === undefined) && /credentials|private key/i.test(err.message)) {
      message = err.message
    }
    return { ok: false, code: "load_failed", message, fetchedAt: now }
  }

  if (deps.findGuestsByPhone) {
    const phones = Array.from(new Set(result.leads.map((l) => l.phone).filter((p) => /^\+\d{8,15}$/.test(p))))
    if (phones.length) {
      try {
        const guests = await deps.findGuestsByPhone(phones)
        const byPhone = new Map<string, { id: string; name: string }>()
        for (const g of guests) if (!byPhone.has(g.phone)) byPhone.set(g.phone, { id: g.id, name: g.name })
        for (const lead of result.leads) lead.guest = byPhone.get(lead.phone) || null
      } catch {
        log("guest_match_failed")
      }
    }
  }

  return {
    ok: true,
    leads: result.leads,
    sheetUrl: "https://docs.google.com/spreadsheets/d/" + cfg.config.spreadsheetId + "/edit",
    tabGids: result.tabGids,
    missingTabs: result.missingTabs,
    fetchedAt: now,
  }
}
