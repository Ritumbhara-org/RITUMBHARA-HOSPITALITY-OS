// Render tests for the Leads page UI states (server-rendered HTML of the real client component).
// next/navigation and the server action are mocked; everything else is the real component tree.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { clearTokenCache, createGoogleSheetsApi } from "../lib/leads/google-sheets"
import { listLeads } from "../lib/leads/service"
import type { LeadsLoadResult } from "../lib/leads/types"
import { sampleSheet, TEST_PRIVATE_KEY } from "./helpers/fake-google-sheets"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/leads" },
})
mock.module(mod("app/actions/leads.ts"), {
  namedExports: { updateLeadStatusAction: async () => ({ success: false, code: "test", error: "test" }) },
})

const NOW = Date.parse("2026-10-17T06:30:00Z")

async function render(data: LeadsLoadResult): Promise<string> {
  const { LeadsClient } = (await import(mod("components/leads/leads-client.tsx"))) as { LeadsClient: (p: { data: LeadsLoadResult }) => React.ReactElement }
  return renderToString(createElement(LeadsClient, { data }))
}

async function realData(): Promise<Extract<LeadsLoadResult, { ok: true }>> {
  const sheet = sampleSheet()
  clearTokenCache()
  const api = createGoogleSheetsApi({ spreadsheetId: sheet.spreadsheetId, account: { clientEmail: "a@b.iam.gserviceaccount.com", privateKey: TEST_PRIVATE_KEY.privateKey }, fetchImpl: sheet.fetch })
  const { leads, tabGids, missingTabs } = await listLeads(api)
  leads[1].guest = { id: "guest-1", name: "Asha Verma" }
  return { ok: true, leads, tabGids, missingTabs, sheetUrl: "https://docs.google.com/spreadsheets/d/" + sheet.spreadsheetId + "/edit", fetchedAt: NOW }
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
}

test("not connected: explains the setup and names only the missing settings", async () => {
  const html = text(await render({ ok: false, code: "not_configured", missing: ["LEADS_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"], fetchedAt: NOW }))
  assert.match(html, /Leads are not connected yet/)
  assert.match(html, /LEADS_SHEET_ID/)
  assert.match(html, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/)
  assert.doesNotMatch(html, /GOOGLE_SERVICE_ACCOUNT_EMAIL/)
})

test("load error: shows the message and a Try again button", async () => {
  const html = text(await render({ ok: false, code: "load_failed", message: "The OS cannot open the leads Google Sheet.", fetchedAt: NOW }))
  assert.match(html, /Leads could not be loaded/)
  assert.match(html, /The OS cannot open the leads Google Sheet\./)
  assert.match(html, /Try again/)
})

test("empty Sheet: friendly empty state and zero counts", async () => {
  const data = await realData()
  const html = text(await render({ ...data, leads: [] }))
  assert.match(html, /No leads yet\./)
  assert.match(html, /Showing 0 of 0 leads/)
})

test("leads: every lead shows with its real fields, status control, guest link and WhatsApp link", async () => {
  const data = await realData()
  const raw = await render(data)
  const html = text(raw)
  for (const id of ["L-00000000A1", "L-00000000B2", "L-00000000C3", "H-00000000D4"]) assert.match(html, new RegExp(id))
  assert.match(html, /Showing 4 of 4 leads/)
  assert.match(html, /Open leads 2/)
  assert.match(html, /Follow-up due 1/)
  assert.match(html, /\+919000000001/)
  assert.match(html, /Jaipur · Ritumbhara Heritage/)
  assert.match(html, /2026-12-10 → 2026-12-12/)
  assert.match(html, /Asha Verma/)
  assert.match(raw, /href="\/guests\/guest-1"/)
  assert.match(raw, /href="https:\/\/wa\.me\/919000000001"/)
  assert.match(html, /Hot/)
  assert.match(html, /Score 80/)
  assert.match(html, /maybe later/) // unrecognised status is visible, not hidden
  assert.match(raw, /aria-label="Status for L-00000000A1"/)
  assert.match(html, /Received 15 Oct/)
  // No invented fields: there is no assignee column in the Sheet, so none is shown.
  assert.doesNotMatch(html, /Assigned/)
})

test("missing tab is reported as a notice, not an error", async () => {
  const data = await realData()
  const html = text(await render({ ...data, missingTabs: ["Handoffs"] }))
  assert.match(html, /Not found in the leads Sheet yet: Handoffs/)
})
