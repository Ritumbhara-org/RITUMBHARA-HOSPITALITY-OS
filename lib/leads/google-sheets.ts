// Minimal Google Sheets REST client for the website leads Sheet. SERVER-ONLY.
//
// Authenticates as a Google service account (signed JWT -> OAuth access token) using only node:crypto, so the OS
// needs no extra dependency. The service account must be shared on the leads Sheet as an Editor.
// Credentials come from server-side environment variables, are never logged, and never leave this module.
// Google error bodies are not logged or returned either (they can echo cell contents); only the HTTP status is.

import { createSign } from "node:crypto"

if (typeof window !== "undefined") {
  throw new Error("lib/leads/google-sheets is server-only and must not be imported in browser code.")
}

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
const SCOPE = "https://www.googleapis.com/auth/spreadsheets"
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

export interface ServiceAccount {
  clientEmail: string
  privateKey: string
}

// Raised for any failure talking to Google. `status` is the HTTP status when Google answered.
export class SheetsRequestError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = "SheetsRequestError"
    this.status = status
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}

// The signed JWT a service account exchanges for an access token (RFC 7523).
export function buildServiceAccountJwt(account: ServiceAccount, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(JSON.stringify({
    iss: account.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }))
  const signer = createSign("RSA-SHA256")
  signer.update(header + "." + claims)
  return header + "." + claims + "." + base64url(signer.sign(account.privateKey))
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

// One cached token per service account email, per server instance.
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export function clearTokenCache() {
  tokenCache.clear()
}

async function accessToken(account: ServiceAccount, fetchImpl: typeof fetch, nowMs: number): Promise<string> {
  const cached = tokenCache.get(account.clientEmail)
  if (cached && cached.expiresAt - 60000 > nowMs) return cached.token

  let assertion: string
  try {
    assertion = buildServiceAccountJwt(account, Math.floor(nowMs / 1000))
  } catch {
    throw new SheetsRequestError("The Google service account private key could not be used. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.")
  }
  const res = await timedFetch(fetchImpl, TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  })
  const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null
  if (!res.ok || !body || typeof body.access_token !== "string") {
    throw new SheetsRequestError("Google rejected the service account credentials.", res.status)
  }
  const ttl = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600
  tokenCache.set(account.clientEmail, { token: body.access_token, expiresAt: nowMs + ttl * 1000 })
  return body.access_token
}

export interface GoogleSheetsOptions {
  spreadsheetId: string
  account: ServiceAccount
  fetchImpl?: typeof fetch
  now?: () => number
}

export function createGoogleSheetsApi(options: GoogleSheetsOptions): SheetsApi {
  const fetchImpl = options.fetchImpl || fetch
  const now = options.now || Date.now
  const base = SHEETS_BASE + "/" + encodeURIComponent(options.spreadsheetId)

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await accessToken(options.account, fetchImpl, now())
    const res = await timedFetch(fetchImpl, base + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: "Bearer " + token, "Content-Type": "application/json" },
    })
    if (!res.ok) {
      if (res.status === 401) tokenCache.delete(options.account.clientEmail)
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
