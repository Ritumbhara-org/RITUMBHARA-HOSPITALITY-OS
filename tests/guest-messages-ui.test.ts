// Render tests for the Week 7 Guest Messages section on the Leads page (server-rendered HTML of the real components).
// next/navigation and both server actions are mocked; the data comes from the real Sheet parser over the fake Sheet.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createGoogleSheetsApi } from "../lib/leads/google-sheets"
import { listLeads } from "../lib/leads/service"
import type { LeadsLoadResult } from "../lib/leads/types"
import type { GuestMessagesLoadResult } from "../lib/guest-messages/types"
import { cellFrom, sampleSheet } from "./helpers/fake-google-sheets"
import { parseGuestMessageRows } from "../lib/guest-messages/service"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/leads" },
})
mock.module(mod("app/actions/leads.ts"), {
  namedExports: { updateLeadStatusAction: async () => ({ success: false, code: "test", error: "test" }) },
})
mock.module(mod("app/actions/guest-messages.ts"), {
  namedExports: { markGuestMessageSentAction: async () => ({ success: false, code: "test", error: "test" }) },
})


const NOW = Date.parse("2026-10-18T03:30:00Z") // 18 Oct 2026, 09:00 IST
const HEADERS = ["Created (IST)", "Message ID", "Status", "Type", "Scheduled Date", "Send By", "Booking ID", "Booking Code",
  "Check-in", "Check-out", "Nights", "Guests", "Property", "Guest", "Guest WhatsApp", "Special Request", "Booking Source",
  "Reason", "Message", "Status Updated (IST)"]
const MESSAGE = "Hi Asha,\n\nThis is Ritumbhara. We're looking forward to hosting you at Studio 925.\n\nBooking ref: RIAA004"

function guestData(canMarkSent: boolean): Extract<GuestMessagesLoadResult, { ok: true }> {
  const rows: (string | number)[][] = [
    HEADERS,
    HEADERS.map((h) => ({ "Message ID": "GM-0000000000A1", Status: "READY", Type: "PRE_ARRIVAL", "Scheduled Date": "2026-10-18", "Send By": "2026-10-19", "Booking ID": "4", "Booking Code": "RIAA004", "Check-in": "2026-10-20", "Check-out": "2026-10-22", Property: "Studio 925", Guest: "Asha", "Guest WhatsApp": "'+919876543210", Message: MESSAGE } as Record<string, string>)[h] || ""),
    HEADERS.map((h) => ({ "Message ID": "GM-0000000000D4", Status: "READY", Type: "CHECKOUT", "Scheduled Date": "2026-10-15", "Send By": "2026-10-15", "Booking Code": "RIAA002", "Guest WhatsApp": "'+919000000001", Message: "Late checkout text" } as Record<string, string>)[h] || ""),
    HEADERS.map((h) => ({ "Message ID": "GM-0000000000B2", Status: "QUEUED", Type: "CHECK_IN", "Scheduled Date": "2026-10-20", "Send By": "2026-10-20", Message: "Check-in text" } as Record<string, string>)[h] || ""),
  ]
  const cells = rows.map((r) => r.map((v) => cellFrom(v)))
  const messages = parseGuestMessageRows(cells.map((r) => r.map((c) => c.formatted)), cells.map((r) => r.map((c) => c.raw)))
  return { ok: true, messages, sheetUrl: "https://docs.google.com/spreadsheets/d/SHEET/edit", tabGid: 1003, tabMissing: false, today: "2026-10-18", canMarkSent, fetchedAt: NOW }
}

async function renderSection(data: GuestMessagesLoadResult): Promise<string> {
  const { GuestMessagesSection } = (await import(mod("components/leads/guest-messages-section.tsx"))) as { GuestMessagesSection: (p: { data: GuestMessagesLoadResult }) => React.ReactElement }
  return renderToString(createElement(GuestMessagesSection, { data }))
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ")
}

test("READY due today is highlighted with every field, the full message, Copy, Open in WhatsApp and Mark as sent", async () => {
  const raw = await renderSection(guestData(true))
  const html = text(raw)
  assert.match(html, /Guest Messages/)
  assert.match(html, /Nothing is sent automatically/)
  assert.match(html, /READY · send today/)
  assert.match(raw, /data-phase="send_now"/)
  for (const s of ["GM-0000000000A1", "Pre-arrival", "RIAA004", "Asha", "\\+919876543210", "Studio 925", "2026-10-20 → 2026-10-22", "2026-10-18 → 2026-10-19", "Status: READY"]) {
    assert.match(html, new RegExp(s))
  }
  assert.match(html, /This is Ritumbhara\. We're looking forward to hosting you at Studio 925\./)
  assert.match(html, /Copy message/)
  assert.match(html, /Open in WhatsApp/)
  assert.match(raw, /href="https:\/\/wa\.me\/919876543210\?text=Hi%20Asha%2C/)
  assert.match(raw, /aria-label="Mark GM-0000000000A1 as sent"/)
  assert.match(html, /Needs action 1/)
  assert.match(html, /1 to send today/)
  // Default view: only what needs action (the missed and upcoming ones are in their own filters).
  assert.doesNotMatch(html, /GM-0000000000D4|GM-0000000000B2/)
})

test("without the Apps Script bridge configured there is no Mark as sent button, only the Sheet instruction", async () => {
  const raw = await renderSection(guestData(false))
  assert.doesNotMatch(raw, /Mark GM-0000000000A1 as sent/)
  assert.match(text(raw), /After sending, set Status to SENT in the Sheet\./)
})

test("not connected, load failure and missing tab are shown as notices", async () => {
  assert.match(text(await renderSection({ ok: false, code: "not_configured", missing: ["LEADS_SHEET_ID"], fetchedAt: NOW })), /not connected yet/)
  const failed = text(await renderSection({ ok: false, code: "load_failed", message: "The guest messages could not be loaded from the Google Sheet.", fetchedAt: NOW }))
  assert.match(failed, /Guest messages could not be loaded/)
  assert.match(failed, /Try again/)
  assert.match(text(await renderSection({ ...guestData(true), messages: [], tabMissing: true, tabGid: null })), /No "Guest Messages" tab in the leads Sheet yet/)
})

test("Leads page: the leads are unchanged and Guest Messages is a separate section below them", async () => {
  const sheet = sampleSheet()
  const api = createGoogleSheetsApi({ spreadsheetId: sheet.spreadsheetId, tokenSource: sheet.tokenSource(), fetchImpl: sheet.fetch })
  const { leads, tabGids, missingTabs } = await listLeads(api)
  const data: LeadsLoadResult = { ok: true, leads, tabGids, missingTabs, sheetUrl: "https://docs.google.com/spreadsheets/d/" + sheet.spreadsheetId + "/edit", fetchedAt: NOW }
  const { LeadsClient } = (await import(mod("components/leads/leads-client.tsx"))) as { LeadsClient: (p: { data: LeadsLoadResult; guestMessages?: GuestMessagesLoadResult }) => React.ReactElement }
  const withGuests = text(renderToString(createElement(LeadsClient, { data, guestMessages: guestData(true) })))
  const without = text(renderToString(createElement(LeadsClient, { data })))
  assert.match(withGuests, /Showing 4 of 4 leads/, "guest messages are not counted as leads")
  assert.match(withGuests, /Open leads 2/)
  assert.ok(withGuests.indexOf("Showing 4 of 4 leads") < withGuests.indexOf("Guest Messages"), "below the leads table")
  assert.match(withGuests, /GM-0000000000A1/)
  assert.doesNotMatch(without, /Guest Messages|GM-0000000000/, "without guest data the Leads page is exactly as before")
  // The leads not-connected state still shows the guest section underneath.
  const notConnected = text(renderToString(createElement(LeadsClient, { data: { ok: false, code: "not_configured", missing: ["LEADS_SHEET_ID"], fetchedAt: NOW }, guestMessages: { ok: false, code: "not_configured", missing: ["LEADS_SHEET_ID"], fetchedAt: NOW } })))
  assert.match(notConnected, /Leads are not connected yet/)
  assert.match(notConnected, /Guest Messages/)
})
