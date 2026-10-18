// Minimal Google Sheets REST client for the website leads Sheet. SERVER-ONLY.
//
// The access token comes from an AccessTokenSource (in production: Vercel OIDC -> Google Workload Identity
// Federation -> the leads service account, see lib/leads/google-auth.ts). No key or credential lives here.
// The service account must be shared on the leads Sheet as an Editor.
// Google error bodies are not logged or returned (they can echo cell contents); only the HTTP status is.

if (typeof window !== "undefined") {
  throw new Error("lib/leads/google-sheets is server-only and must not be imported in browser code.")
}

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
const REQUEST_TIMEOUT_MS = 10000

export type CellValue = string | number | boolean
export type Grid = CellValue[][]

export interface SheetTab {
  title: string
  sheetId: number
}

export interface SpreadsheetMeta {
  timeZone: string
  tabs: SheetTab[]
}

export type ValueRender = "FORMATTED_VALUE" | "UNFORMATTED_VALUE"

// The three Sheets operations the Leads tab needs. Tests use an in-memory implementation of this interface.
export interface SheetsApi {
  spreadsheetId: string
  getMeta(): Promise<SpreadsheetMeta>
  batchGet(ranges: string[], render: ValueRender): Promise<Grid[]>
  batchUpdate(data: { range: string; values: CellValue[][] }[]): Promise<void>
}

// Supplies OAuth access tokens for the Sheets scope. `reset` drops any cached credentials (called after a 401).
export interface AccessTokenSource {
  getAccessToken(): Promise<string>
  reset?(): void
}

// Raised for any failure talking to Google. `status` is the HTTP status when Google answered. `auth` marks a
// failure to obtain Google credentials at all (nothing was read or written); its message is safe to show admins.
export class SheetsRequestError extends Error {
  status?: number
  auth?: boolean
  constructor(message: string, status?: number, auth?: boolean) {
    super(message)
    this.name = "SheetsRequestError"
    this.status = status
    this.auth = auth
  }
}

async function timedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError"
    throw new SheetsRequestError(timedOut ? "Google Sheets did not respond in time." : "Could not reach Google Sheets.")
  } finally {
    clearTimeout(timer)
  }
}

export interface GoogleSheetsOptions {
  spreadsheetId: string
  tokenSource: AccessTokenSource
  fetchImpl?: typeof fetch
}

export function createGoogleSheetsApi(options: GoogleSheetsOptions): SheetsApi {
  const fetchImpl = options.fetchImpl || fetch
  const base = SHEETS_BASE + "/" + encodeURIComponent(options.spreadsheetId)

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await options.tokenSource.getAccessToken()
    const res = await timedFetch(fetchImpl, base + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: "Bearer " + token, "Content-Type": "application/json" },
    })
    if (!res.ok) {
      if (res.status === 401 && options.tokenSource.reset) options.tokenSource.reset()
      throw new SheetsRequestError("Google Sheets request failed (HTTP " + res.status + ").", res.status)
    }
    return res.json().catch(() => {
      throw new SheetsRequestError("Google Sheets sent an unreadable response.")
    })
  }

  return {
    spreadsheetId: options.spreadsheetId,

    async getMeta() {
      const body = (await call("?fields=properties.timeZone,sheets.properties(sheetId,title)")) as {
        properties?: { timeZone?: string }
        sheets?: { properties?: { sheetId?: number; title?: string } }[]
      }
      const tabs: SheetTab[] = []
      for (const s of body.sheets || []) {
        if (s.properties && typeof s.properties.title === "string" && typeof s.properties.sheetId === "number") {
          tabs.push({ title: s.properties.title, sheetId: s.properties.sheetId })
        }
      }
      return { timeZone: (body.properties && body.properties.timeZone) || "Asia/Kolkata", tabs }
    },

    async batchGet(ranges, render) {
      if (!ranges.length) return []
      const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: render, dateTimeRenderOption: "SERIAL_NUMBER" })
      for (const r of ranges) params.append("ranges", r)
      const body = (await call("/values:batchGet?" + params.toString())) as { valueRanges?: { values?: Grid }[] }
      const out = body.valueRanges || []
      return ranges.map((_, i) => (out[i] && out[i].values) || [])
    },

    async batchUpdate(data) {
      if (!data.length) return
      // USER_ENTERED: the same interpretation Apps Script's setValue uses, so "2026-10-17 12:00:00" is stored
      // as a date-time exactly like the timestamps the website's Apps Script writes.
      await call("/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
      })
    },
  }
}
