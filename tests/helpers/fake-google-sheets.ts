// In-memory stand-in for the Sheets v4 REST API (through a fake `fetch`) and for the Google access-token source.
// It stores each cell as { formatted, raw } so FORMATTED_VALUE and UNFORMATTED_VALUE reads behave like Sheets:
// text that looks like "yyyy-MM-dd[ HH:mm:ss]" becomes a date serial (IST) when written with USER_ENTERED.

import { SheetsRequestError, type AccessTokenSource } from "../../lib/leads/google-sheets"

type Raw = string | number | boolean
interface Cell { formatted: string; raw: Raw }

export interface FakeCall { method: string; url: string; body?: string }

export function istTextToSerial(text: string): number | null {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/)
  if (!m) return null
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  return wall / 86400000 + 25569
}

export function cellFrom(value: Raw): Cell {
  if (typeof value === "string") {
    const serial = istTextToSerial(value)
    if (serial !== null) return { formatted: value, raw: serial }
    if (value.startsWith("'")) return { formatted: value.slice(1), raw: value.slice(1) }
    if (value !== "" && /^-?\d+(\.\d+)?$/.test(value)) return { formatted: value, raw: Number(value) }
    return { formatted: value, raw: value }
  }
  return { formatted: String(value), raw: value }
}

function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseTabName(range: string): { tab: string; rest: string } {
  const m = range.match(/^'((?:[^']|'')*)'(?:!(.*))?$/)
  if (!m) throw new Error("unquoted range in fake: " + range)
  return { tab: m[1].replace(/''/g, "'"), rest: m[2] || "" }
}

export class FakeGoogleSheets {
  spreadsheetId: string
  timeZone = "Asia/Kolkata"
  tabs = new Map<string, { sheetId: number; rows: Cell[][] }>()
  calls: FakeCall[] = []
  tokensIssued = 0
  tokenResets = 0
  // Set to make the token source fail the way lib/leads/google-auth.ts reports a Google sign-in failure.
  failAuth = false
  // Set to make the next matching request fail with this HTTP status.
  failNext: { match: "meta" | "get" | "update"; status: number } | null = null
  failAlways: { match: "meta" | "get" | "update"; status: number } | null = null

  constructor(spreadsheetId = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd") {
    this.spreadsheetId = spreadsheetId
  }

  addTab(title: string, rows: Raw[][]) {
    this.tabs.set(title, { sheetId: 1000 + this.tabs.size, rows: rows.map((r) => r.map(cellFrom)) })
    return this
  }

  cell(tab: string, a1: string): Cell | undefined {
    const m = a1.match(/^([A-Z]+)(\d+)$/)
    if (!m) throw new Error("bad a1")
    const t = this.tabs.get(tab)
    return t && t.rows[+m[2] - 1] ? t.rows[+m[2] - 1][colIndex(m[1])] : undefined
  }

  // Formatted value of a cell located by header name and ID (for assertions).
  valueById(tab: string, idHeader: string, id: string, header: string): string {
    const t = this.tabs.get(tab)
    if (!t) throw new Error("no tab")
    const headers = t.rows[0].map((c) => c.formatted)
    const row = t.rows.find((r, i) => i > 0 && r[headers.indexOf(idHeader)] && r[headers.indexOf(idHeader)].formatted === id)
    if (!row) throw new Error("no row " + id)
    const c = row[headers.indexOf(header)]
    return c ? c.formatted : ""
  }

  // Access tokens accepted by this fake (stands in for the Vercel OIDC / Workload Identity token source).
  tokenSource(): AccessTokenSource {
    return {
      getAccessToken: async () => {
        if (this.failAuth) throw new SheetsRequestError("Google rejected the OS's Workload Identity credentials.", undefined, true)
        this.tokensIssued++
        return "fake-token-" + this.tokensIssued
      },
      reset: () => { this.tokenResets++ },
    }
  }

  private fail(kind: "meta" | "get" | "update"): Response | null {
    const f = this.failNext && this.failNext.match === kind ? this.failNext : this.failAlways && this.failAlways.match === kind ? this.failAlways : null
    if (!f) return null
    if (f === this.failNext) this.failNext = null
    return new Response(JSON.stringify({ error: { message: "secret-detail +919000000001" } }), { status: f.status })
  }

  fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = (init && init.method) || "GET"
    const body = init && typeof init.body === "string" ? init.body : undefined
    this.calls.push({ method, url, body })

    const base = "https://sheets.googleapis.com/v4/spreadsheets/" + this.spreadsheetId
    if (!url.startsWith(base)) return new Response("{}", { status: 404 })
    const auth = new Headers((init && init.headers) || {}).get("Authorization") || ""
    if (!/^Bearer fake-token-\d+$/.test(auth)) return new Response("{}", { status: 401 })
    const rest = url.slice(base.length)

    if (rest.startsWith("?fields=")) {
      const failed = this.fail("meta")
      if (failed) return failed
      return Response.json({
        properties: { timeZone: this.timeZone },
        sheets: Array.from(this.tabs.entries()).map(([title, t]) => ({ properties: { sheetId: t.sheetId, title } })),
      })
    }

    if (rest.startsWith("/values:batchGet?")) {
      const failed = this.fail("get")
      if (failed) return failed
      const params = new URLSearchParams(rest.slice("/values:batchGet?".length))
      const render = params.get("valueRenderOption")
      const valueRanges = params.getAll("ranges").map((range) => {
        const { tab, rest: r } = parseTabName(range)
        const t = this.tabs.get(tab)
        if (!t) throw new Error("fake: unknown tab " + tab)
        if (r) throw new Error("fake: only whole-tab reads are supported")
        const values = t.rows.map((row) => row.map((c) => (render === "UNFORMATTED_VALUE" ? c.raw : c.formatted)))
        // Sheets trims trailing empty rows and cells.
        while (values.length && values[values.length - 1].every((v) => v === "")) values.pop()
        return { range, values: values.map((row) => { const out = row.slice(); while (out.length && out[out.length - 1] === "") out.pop(); return out }) }
      })
      return Response.json({ spreadsheetId: this.spreadsheetId, valueRanges })
    }

    if (rest === "/values:batchUpdate" && method === "POST") {
      const failed = this.fail("update")
      if (failed) return failed
      const payload = JSON.parse(body || "{}") as { valueInputOption: string; data: { range: string; values: Raw[][] }[] }
      if (payload.valueInputOption !== "USER_ENTERED") return new Response("{}", { status: 400 })
      for (const d of payload.data) {
        const { tab, rest: a1 } = parseTabName(d.range)
        const m = a1.match(/^([A-Z]+)(\d+)$/)
        const t = this.tabs.get(tab)
        if (!m || !t) return new Response("{}", { status: 400 })
        const r = +m[2] - 1, c = colIndex(m[1])
        while (t.rows.length <= r) t.rows.push([])
        while (t.rows[r].length <= c) t.rows[r].push(cellFrom(""))
        t.rows[r][c] = cellFrom(d.values[0][0])
      }
      return Response.json({ totalUpdatedCells: payload.data.length })
    }

    return new Response("{}", { status: 404 })
  }) as typeof fetch
}

export const QUALIFIED_HEADERS = ["Received (IST)", "Lead ID", "Status", "Phone", "Destination", "Property", "Check-in", "Check-out",
  "Nights", "Guests", "Requirements", "Ref", "Source", "Conversation State", "Qualification Status", "Site",
  "Received (UTC)", "Handoff Number", "Notes", "Email Status", "Status Updated (IST)", "Next Follow-up", "Score", "Priority"]
export const HANDOFF_HEADERS = ["Received (IST)", "Handoff ID", "Status", "Reason", "Phone", "Destination", "Property", "Check-in",
  "Check-out", "Nights", "Guests", "Requirements", "Ref", "Source", "Conversation State", "Qualification Status", "Site",
  "Received (UTC)", "Handoff Number", "Email Status", "Status Updated (IST)", "Next Follow-up", "Score", "Priority"]

export function qualifiedRow(v: Partial<Record<string, Raw>>): Raw[] {
  return QUALIFIED_HEADERS.map((h) => (v[h] === undefined ? "" : (v[h] as Raw)))
}
export function handoffRow(v: Partial<Record<string, Raw>>): Raw[] {
  return HANDOFF_HEADERS.map((h) => (v[h] === undefined ? "" : (v[h] as Raw)))
}

// A Sheet shaped like production: both tabs, a few leads, phones stored with the Apps Script's leading quote.
export function sampleSheet(): FakeGoogleSheets {
  return new FakeGoogleSheets()
    .addTab("WhatsApp Clicks", [["Received (IST)", "Status", "Ref"], ["2026-10-15 10:00:00", "ok", "W-HOME"]])
    .addTab("Qualified Leads", [
      QUALIFIED_HEADERS,
      qualifiedRow({ "Received (IST)": "2026-10-15 10:30:00", "Lead ID": "L-00000000A1", Status: "New", Phone: "'+919000000001", Destination: "Jaipur", Property: "Ritumbhara Heritage", "Check-in": "2026-12-10", "Check-out": "2026-12-12", Nights: 2, Guests: 2, Ref: "W-HOME", Source: "website", "Status Updated (IST)": "2026-10-15 10:30:00", "Next Follow-up": "2026-10-16 10:30:00", Score: 80, Priority: "Hot", Notes: "Anniversary trip" }),
      qualifiedRow({ "Received (IST)": "2026-10-16 09:00:00", "Lead ID": "L-00000000B2", Status: "Contacted", Phone: "'+919000000002", Destination: "Udaipur", "Check-in": "2026-11-20", "Check-out": "2026-11-22", Nights: 2, Guests: 4, Ref: "DIRECT", Source: "whatsapp", "Status Updated (IST)": "2026-10-16 12:00:00", "Next Follow-up": "2026-10-18 12:00:00", Score: 55, Priority: "Warm" }),
      qualifiedRow({ "Received (IST)": "2026-10-01 08:00:00", "Lead ID": "L-00000000C3", Status: "Booked", Phone: "'+919000000003", Destination: "Jaipur", Source: "website", Score: 70, Priority: "Warm" }),
      qualifiedRow({ "Lead ID": "", Status: "" }), // blank row the team left behind
    ])
    .addTab("Handoffs", [
      HANDOFF_HEADERS,
      handoffRow({ "Received (IST)": "2026-10-17 08:00:00", "Handoff ID": "H-00000000D4", Status: "maybe later", Reason: "asked_for_human", Phone: "'+919000000004", Destination: "Goa", Source: "whatsapp", Score: 20, Priority: "Cold" }),
    ])
}
