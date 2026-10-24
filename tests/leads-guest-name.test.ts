// "Guest Name" and "Booking Code" on the Leads page. The website's Apps Script writes them on the Handoffs tab for
// WhatsApp Guest Escalation leads (verified booking only); every other lead has no such values.
// Proves: both columns are read by header name; tabs without them (today's Sheet) still load with "" values; the Guest
// column shows the OS profile first, then the Sheet's Guest Name, else "No guest profile" (never an invented name);
// search finds a lead by guest name and booking code.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createGoogleSheetsApi } from "../lib/leads/google-sheets"
import { listLeads } from "../lib/leads/service"
import type { Lead, LeadsLoadResult } from "../lib/leads/types"
import { guestDisplay, matchesSearch } from "../lib/leads/view"
import { FakeGoogleSheets, HANDOFF_HEADERS, QUALIFIED_HEADERS, handoffRow, sampleSheet } from "./helpers/fake-google-sheets"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/leads" },
})
mock.module(mod("app/actions/leads.ts"), {
  namedExports: { updateLeadStatusAction: async () => ({ success: false, code: "test", error: "test" }) },
})

const NOW = Date.parse("2026-10-19T14:30:00Z")
// The Handoffs tab after the Apps Script adds the two columns (appended at the end, existing columns unmoved).
const NEW_HANDOFF_HEADERS = [...HANDOFF_HEADERS, "Guest Name", "Booking Code"]

function escalationLeadSheet(): FakeGoogleSheets {
  const values: Record<string, string | number> = {
    "Received (IST)": "2026-10-19 19:32:30", "Handoff ID": "H-0DD420D0C2", Status: "New", Reason: "BOOKING_CHANGE",
    Phone: "'+918712308682", Destination: "sariska", Property: "Villa 65 Sariska", "Check-in": "2026-10-18", "Check-out": "2026-10-20",
    Requirements: "[2026-10-19 19:32:30 E-0DD420D0C2] Hi, I have a booking for Villa 65 Sariska. Can I extend my stay by one night?",
    Source: "guest-escalation", "Guest Name": "Aani", "Booking Code": "RIAA005", Score: 10, Priority: "Cold",
  }
  return new FakeGoogleSheets().addTab("Handoffs", [
    NEW_HANDOFF_HEADERS,
    NEW_HANDOFF_HEADERS.map((h) => (values[h] === undefined ? "" : values[h])),
    NEW_HANDOFF_HEADERS.map((h) => ({ "Handoff ID": "H-00000000D9", Status: "New", Phone: "'+919000000009", Source: "whatsapp" } as Record<string, string>)[h] || ""),
  ])
}

async function load(sheet: FakeGoogleSheets) {
  return listLeads(createGoogleSheetsApi({ spreadsheetId: sheet.spreadsheetId, tokenSource: sheet.tokenSource(), fetchImpl: sheet.fetch }))
}

async function render(leads: Lead[]): Promise<string> {
  const { LeadsClient } = (await import(mod("components/leads/leads-client.tsx"))) as { LeadsClient: (p: { data: LeadsLoadResult }) => React.ReactElement }
  const data: LeadsLoadResult = { ok: true, leads, tabGids: {}, missingTabs: [], sheetUrl: "https://docs.google.com/spreadsheets/d/x/edit", fetchedAt: NOW }
  return renderToString(createElement(LeadsClient, { data }))
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")

test("Guest Name and Booking Code are read by header name from the Handoffs tab", async () => {
  const { leads } = await load(escalationLeadSheet())
  const l = leads.find((x) => x.id === "H-0DD420D0C2")!
  assert.equal(l.guestName, "Aani")
  assert.equal(l.bookingCode, "RIAA005")
  assert.equal(l.phone, "+918712308682")
  assert.equal(l.property, "Villa 65 Sariska")
  assert.equal(l.reason, "BOOKING_CHANGE")
  assert.equal(l.source, "guest-escalation")
  const other = leads.find((x) => x.id === "H-00000000D9")!
  assert.equal(other.guestName, "", "a lead without a name stays without one")
  assert.equal(other.bookingCode, "")
})

test("today's Sheet (no Guest Name / Booking Code columns) still loads; the fields are empty", async () => {
  const { leads } = await load(sampleSheet())
  assert.equal(leads.length, 4)
  for (const l of leads) {
    assert.equal(l.guestName, "")
    assert.equal(l.bookingCode, "")
  }
  // Reordered columns: still found by name.
  const reordered = [...NEW_HANDOFF_HEADERS].reverse()
  const sheet = new FakeGoogleSheets().addTab("Handoffs", [reordered, reordered.map((h) => ({ "Handoff ID": "H-0000000AAA", "Guest Name": "Ravi", "Booking Code": "RB1" } as Record<string, string>)[h] || "")])
  const [l] = (await load(sheet)).leads
  assert.equal(l.guestName, "Ravi")
  assert.equal(l.bookingCode, "RB1")
})

test("guestDisplay: OS profile first, then the Sheet's Guest Name, else nothing (never invented)", async () => {
  const { leads } = await load(escalationLeadSheet())
  const named = leads.find((x) => x.id === "H-0DD420D0C2")!
  const unnamed = leads.find((x) => x.id === "H-00000000D9")!
  assert.deepEqual(guestDisplay(named), { kind: "sheet", name: "Aani" })
  assert.deepEqual(guestDisplay(unnamed), { kind: "none" })
  assert.deepEqual(guestDisplay({ ...named, guest: { id: "g1", name: "Aani Sharma" } }), { kind: "profile", id: "g1", name: "Aani Sharma" })
  assert.deepEqual(guestDisplay({ ...named, guestName: "   " }), { kind: "none" })
})

test("Leads page: shows the guest's name instead of 'No guest profile'; keeps the fallback and the profile link", async () => {
  const { leads } = await load(escalationLeadSheet())
  // (Each lead is rendered twice: the mobile card and the desktop table both use the Guest cell.)
  const named = text(await render(leads.filter((l) => l.id === "H-0DD420D0C2")))
  assert.match(named, /Aani \+918712308682/, "name above the phone in the Guest column")
  assert.doesNotMatch(named, /No guest profile/)
  const unnamed = text(await render(leads.filter((l) => l.id === "H-00000000D9")))
  assert.match(unnamed, /No guest profile \+919000000009/, "a lead without a name keeps the existing fallback")
  const withProfile = leads.map((l) => (l.id === "H-0DD420D0C2" ? { ...l, guest: { id: "g1", name: "Aani Sharma" } } : l))
  const raw = await render(withProfile)
  assert.match(raw, /href="\/guests\/g1"/, "an OS guest profile is still linked")
  assert.match(text(raw), /Aani Sharma/)
})

test("search finds a lead by guest name or booking code", async () => {
  const { leads } = await load(escalationLeadSheet())
  const l = leads.find((x) => x.id === "H-0DD420D0C2")!
  assert.ok(matchesSearch(l, "aani"))
  assert.ok(matchesSearch(l, "RIAA005"))
  assert.ok(!matchesSearch(leads.find((x) => x.id === "H-00000000D9")!, "aani"))
})

test("the existing Handoffs fixture is unchanged (production layout today)", () => {
  assert.equal(handoffRow({}).length, HANDOFF_HEADERS.length)
  assert.ok(!HANDOFF_HEADERS.includes("Guest Name"))
})

// The Handoffs tab after the Apps Script's moveHandoffGuestColumns(): Guest Name and Booking Code next to the ID.
const MOVED_HANDOFF_HEADERS = ["Received (IST)", "Handoff ID", "Guest Name", "Booking Code", "Status", "Reason", "Phone",
  "Destination", "Property", "Check-in", "Check-out", ...NEW_HANDOFF_HEADERS.filter((h) => !["Received (IST)", "Handoff ID",
    "Guest Name", "Booking Code", "Status", "Reason", "Phone", "Destination", "Property", "Check-in", "Check-out"].includes(h))]

test("after the column move every field still maps by header; a status change writes the moved Status column", async () => {
  assert.equal(MOVED_HANDOFF_HEADERS.length, NEW_HANDOFF_HEADERS.length)
  assert.equal(new Set(MOVED_HANDOFF_HEADERS).size, MOVED_HANDOFF_HEADERS.length, "no duplicate columns")
  const values: Record<string, string | number> = {
    "Received (IST)": "2026-10-19 20:13:55", "Handoff ID": "H-FFF6E04826", "Guest Name": "Aani", "Booking Code": "RIAA005",
    Status: "New", Reason: "BOOKING_CHANGE", Phone: "'+918712308682", Destination: "sariska", Property: "Villa 65 Sariska",
    "Check-in": "2026-10-18", "Check-out": "2026-10-20", Source: "guest-escalation", "Next Follow-up": "2026-10-20 20:13:55",
  }
  const sheet = new FakeGoogleSheets().addTab("Handoffs", [
    MOVED_HANDOFF_HEADERS,
    MOVED_HANDOFF_HEADERS.map((h) => (values[h] === undefined ? "" : values[h])),
    MOVED_HANDOFF_HEADERS.map((h) => ({ "Handoff ID": "H-1D83E0A88A", Status: "New", Phone: "'+918712308682", Source: "whatsapp-bot" } as Record<string, string>)[h] || ""),
  ])
  const { leads } = await load(sheet)
  const l = leads.find((x) => x.id === "H-FFF6E04826")!
  assert.deepEqual(
    [l.guestName, l.bookingCode, l.statusText, l.reason, l.phone, l.destination, l.property, l.checkIn, l.checkOut, l.source],
    ["Aani", "RIAA005", "New", "BOOKING_CHANGE", "+918712308682", "sariska", "Villa 65 Sariska", "2026-10-18", "2026-10-20", "guest-escalation"])
  assert.deepEqual(guestDisplay(l), { kind: "sheet", name: "Aani" })
  const older = leads.find((x) => x.id === "H-1D83E0A88A")!
  assert.deepEqual([older.guestName, older.bookingCode, older.source], ["", "", "whatsapp-bot"])
  assert.match(text(await render([l])), /Aani \+918712308682/)

  // The OS writes Status where the Status header now is (column E), never into Guest Name / Booking Code (C / D).
  const { updateLeadStatus } = await import("../lib/leads/service")
  const api = createGoogleSheetsApi({ spreadsheetId: sheet.spreadsheetId, tokenSource: sheet.tokenSource(), fetchImpl: sheet.fetch })
  await updateLeadStatus(api, { kind: "handoff", id: "H-FFF6E04826", status: "Contacted", expectedStatus: "New" }, new Date(NOW))
  assert.equal(sheet.cell("Handoffs", "E2")?.formatted, "Contacted")
  assert.equal(sheet.cell("Handoffs", "C2")?.formatted, "Aani")
  assert.equal(sheet.cell("Handoffs", "D2")?.formatted, "RIAA005")
})

test("Qualified Leads with the new Guest Name column (name typed by the guest to the WhatsApp assistant) shows it", async () => {
  const headers = [...QUALIFIED_HEADERS, "Status Updated (IST)", "Next Follow-up", "Score", "Priority", "Guest Name"]
  const sheet = new FakeGoogleSheets().addTab("Qualified Leads", [
    headers,
    headers.map((h) => ({ "Received (IST)": "2026-10-24 11:00:00", "Lead ID": "L-00000000F1", Status: "New", Phone: "'+919000000001", Destination: "Jaipur", "Guest Name": "Asha Verma" } as Record<string, string>)[h] || ""),
  ])
  const [l] = (await load(sheet)).leads
  assert.equal(l.guestName, "Asha Verma")
  assert.match(text(await render([l])), /Asha Verma \+919000000001/)
})
