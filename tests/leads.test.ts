import { test } from "node:test"
import assert from "node:assert/strict"
import { createGoogleSheetsApi, SheetsRequestError } from "../lib/leads/google-sheets"
import {
  cellTimeMs, columnLetter, getLeadsConfig, istText, listLeads, loadLeads, nextFollowUpFor, parseSheetId,
  updateLeadStatus, LeadUpdateError, type LeadsConfig,
} from "../lib/leads/service"
import { canonicalStatus, type Lead } from "../lib/leads/types"
import { countLeads, endOfTodayIst, isFollowUpDue, matchesSearch, sortLeads, visibleLeads } from "../lib/leads/view"
import {
  FakeGoogleSheets, QUALIFIED_HEADERS, qualifiedRow, sampleSheet,
} from "./helpers/fake-google-sheets"

const WIF = {
  projectId: "ritumbhara-test-project",
  projectNumber: "123456789012",
  serviceAccountEmail: "leads-reader@ritumbhara-test-project.iam.gserviceaccount.com",
  poolId: "vercel",
  providerId: "vercel",
}
const WIF_ENV = {
  GCP_PROJECT_ID: WIF.projectId,
  GCP_PROJECT_NUMBER: WIF.projectNumber,
  GCP_SERVICE_ACCOUNT_EMAIL: WIF.serviceAccountEmail,
  GCP_WORKLOAD_IDENTITY_POOL_ID: WIF.poolId,
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: WIF.providerId,
}
// 17 Oct 2026, 12:00 IST
const NOW = new Date("2026-10-17T06:30:00Z")

function apiFor(sheet: FakeGoogleSheets) {
  return createGoogleSheetsApi({ spreadsheetId: sheet.spreadsheetId, tokenSource: sheet.tokenSource(), fetchImpl: sheet.fetch })
}

function configFor(sheet: FakeGoogleSheets): LeadsConfig {
  return { spreadsheetId: sheet.spreadsheetId, workloadIdentity: WIF }
}

// ---------- status rules (same as the Sheet's Apps Script) ----------

test("canonicalStatus accepts the four Sheet statuses in any case and rejects anything else", () => {
  assert.equal(canonicalStatus(" contacted "), "Contacted")
  assert.equal(canonicalStatus("BOOKED"), "Booked")
  assert.equal(canonicalStatus("maybe later"), null)
  assert.equal(canonicalStatus(""), null)
  assert.equal(canonicalStatus(undefined), null)
})

test("istText and nextFollowUpFor match the Apps Script format and day counts", () => {
  assert.equal(istText(NOW), "2026-10-17 12:00:00")
  assert.equal(nextFollowUpFor("New", NOW), "2026-10-18 12:00:00")
  assert.equal(nextFollowUpFor("Contacted", NOW), "2026-10-19 12:00:00")
  assert.equal(nextFollowUpFor("Booked", NOW), "")
  assert.equal(nextFollowUpFor("Lost", NOW), "")
})

test("cellTimeMs reads Sheets date serials in the Sheet's time zone and IST text", () => {
  const serial = 46312.5 // 2026-10-17 12:00 wall clock
  assert.equal(new Date(cellTimeMs(serial, "Asia/Kolkata") as number).toISOString(), "2026-10-17T06:30:00.000Z")
  assert.equal(new Date(cellTimeMs(serial, "UTC") as number).toISOString(), "2026-10-17T12:00:00.000Z")
  assert.equal(new Date(cellTimeMs("2026-10-17 12:00:00", "UTC") as number).toISOString(), "2026-10-17T06:30:00.000Z")
  assert.equal(new Date(cellTimeMs("2026-12-10", "Asia/Kolkata") as number).toISOString(), "2026-12-09T18:30:00.000Z")
  assert.equal(cellTimeMs("", "Asia/Kolkata"), null)
  assert.equal(cellTimeMs("next week", "Asia/Kolkata"), null)
})

test("columnLetter converts column numbers to A1 letters", () => {
  assert.deepEqual([1, 3, 26, 27, 52, 703].map(columnLetter), ["A", "C", "Z", "AA", "AZ", "AAA"])
})

// ---------- configuration ----------

test("getLeadsConfig reports exactly which settings are missing, never their values", () => {
  const r = getLeadsConfig({})
  assert.equal(r.ok, false)
  assert.deepEqual(!r.ok && r.missing, [
    "LEADS_SHEET_ID", "GCP_PROJECT_ID", "GCP_PROJECT_NUMBER", "GCP_SERVICE_ACCOUNT_EMAIL",
    "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  ])
  // A service-account key is no longer used: setting the old variables configures nothing.
  const legacy = getLeadsConfig({ LEADS_SHEET_ID: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd", GOOGLE_SERVICE_ACCOUNT_EMAIL: WIF.serviceAccountEmail, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----" })
  assert.equal(legacy.ok, false)
})

test("getLeadsConfig accepts a pasted Sheet URL plus the five GCP_* Workload Identity settings", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd"
  const r = getLeadsConfig({ LEADS_SHEET_ID: "https://docs.google.com/spreadsheets/d/" + id + "/edit#gid=0", ...WIF_ENV })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.config.spreadsheetId, id)
    assert.deepEqual(r.config.workloadIdentity, WIF)
  }
  assert.equal(parseSheetId("not a sheet"), null)
})

test("getLeadsConfig rejects malformed GCP_* values by name", () => {
  const r = getLeadsConfig({
    LEADS_SHEET_ID: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd",
    ...WIF_ENV,
    GCP_PROJECT_NUMBER: "ritumbhara-test-project", // project ID pasted into the number slot
    GCP_SERVICE_ACCOUNT_EMAIL: "someone@gmail.com",
  })
  assert.deepEqual(!r.ok && r.missing, ["GCP_PROJECT_NUMBER", "GCP_SERVICE_ACCOUNT_EMAIL"])
})

// ---------- Google client ----------

test("the Sheets client sends the token source's access token and resets it after a 401", async () => {
  const sheet = sampleSheet()
  const api = apiFor(sheet)
  await api.getMeta()
  assert.equal(sheet.tokensIssued, 1)
  const stale = createGoogleSheetsApi({
    spreadsheetId: sheet.spreadsheetId,
    tokenSource: { getAccessToken: async () => "expired-token", reset: () => { sheet.tokenResets++ } },
    fetchImpl: sheet.fetch,
  })
  await assert.rejects(stale.getMeta(), (err: unknown) => err instanceof SheetsRequestError && err.status === 401)
  assert.equal(sheet.tokenResets, 1)
})

test("Google errors become SheetsRequestError with the status only (no response text, no phone numbers)", async () => {
  const sheet = sampleSheet()
  sheet.failNext = { match: "meta", status: 403 }
  const api = apiFor(sheet)
  await assert.rejects(api.getMeta(), (err: unknown) => {
    assert.ok(err instanceof SheetsRequestError)
    assert.equal(err.status, 403)
    assert.doesNotMatch(err.message, /secret-detail|\+91/)
    return true
  })
})

test("a Google sign-in failure stops before any Sheets call and is shown as a clear admin message", async () => {
  const sheet = sampleSheet()
  sheet.failAuth = true
  await assert.rejects(apiFor(sheet).getMeta(), (err: unknown) => err instanceof SheetsRequestError && err.auth === true)
  assert.equal(sheet.calls.length, 0)
  const logged: unknown[] = []
  const r = await loadLeads({ getConfig: () => ({ ok: true, config: configFor(sheet) }), createApi: () => apiFor(sheet), log: (e, d) => logged.push([e, d]) })
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.code, "load_failed")
  assert.match(!r.ok && r.code === "load_failed" ? r.message : "", /Workload Identity credentials/)
})

// ---------- reading leads ----------

test("listLeads reads both lead tabs (not WhatsApp Clicks), skips blank rows and keeps unknown statuses visible", async () => {
  const sheet = sampleSheet()
  const { leads, tabGids, missingTabs } = await listLeads(apiFor(sheet))
  assert.deepEqual(leads.map((l) => l.key), ["qualified:L-00000000A1", "qualified:L-00000000B2", "qualified:L-00000000C3", "handoff:H-00000000D4"])
  assert.deepEqual(missingTabs, [])
  assert.equal(typeof tabGids.qualified, "number")

  const a = leads[0]
  assert.equal(a.phone, "+919000000001")
  assert.equal(a.status, "New")
  assert.equal(a.destination, "Jaipur")
  assert.equal(a.property, "Ritumbhara Heritage")
  assert.equal(a.checkIn, "2026-12-10")
  assert.equal(a.nights, "2")
  assert.equal(a.score, 80)
  assert.equal(a.priority, "Hot")
  assert.equal(a.notes, "Anniversary trip")
  assert.equal(a.row, 2)
  assert.equal(new Date(a.receivedMs as number).toISOString(), "2026-10-15T05:00:00.000Z")
  assert.equal(new Date(a.nextFollowUpMs as number).toISOString(), "2026-10-16T05:00:00.000Z")

  const d = leads[3]
  assert.equal(d.kind, "handoff")
  assert.equal(d.status, null)
  assert.equal(d.statusText, "maybe later")
  assert.equal(d.reason, "asked_for_human")
})

test("columns are found by header name, so reordered and team-added columns are read correctly", async () => {
  const headers = ["Team Owner Note", ...QUALIFIED_HEADERS.slice().reverse()]
  const row = headers.map((h) => ({ "Team Owner Note": "call after 6pm", "Lead ID": "L-00000000E5", Status: "Contacted", Phone: "'+919000000005", Destination: "Pushkar" } as Record<string, string>)[h] || "")
  const sheet = new FakeGoogleSheets().addTab("Qualified Leads", [headers, row])
  const { leads, missingTabs } = await listLeads(apiFor(sheet))
  assert.equal(leads.length, 1)
  assert.equal(leads[0].id, "L-00000000E5")
  assert.equal(leads[0].status, "Contacted")
  assert.equal(leads[0].destination, "Pushkar")
  assert.deepEqual(missingTabs, ["Handoffs"])
})

// ---------- updating status ----------

test("changing status writes Status, Status Updated (IST) and Next Follow-up only, in the right row", async () => {
  const sheet = sampleSheet()
  const before = JSON.stringify(sheet.tabs.get("Qualified Leads")!.rows.map((r) => r.map((c) => c.formatted)))
  const r = await updateLeadStatus(apiFor(sheet), { kind: "qualified", id: "L-00000000A1", status: "Contacted", expectedStatus: "New" }, NOW)
  assert.deepEqual(r, { success: true, unchanged: false, status: "Contacted", statusUpdated: "2026-10-17 12:00:00", nextFollowUp: "2026-10-19 12:00:00", nextFollowUpMs: Date.parse("2026-10-19T06:30:00Z") })

  const update = sheet.calls.find((c) => c.url.endsWith("/values:batchUpdate"))
  const ranges = JSON.parse(update!.body!).data.map((d: { range: string }) => d.range)
  assert.deepEqual(ranges, ["'Qualified Leads'!C2", "'Qualified Leads'!U2", "'Qualified Leads'!V2"])

  const after = sheet.tabs.get("Qualified Leads")!.rows.map((row) => row.map((c) => c.formatted))
  const changed: string[] = []
  JSON.parse(before).forEach((row: string[], i: number) => row.forEach((v, j) => { if (after[i][j] !== v) changed.push(QUALIFIED_HEADERS[j] + "@" + (i + 1)) }))
  assert.deepEqual(changed, ["Status@2", "Status Updated (IST)@2", "Next Follow-up@2"])
})

test("Booked and Lost clear Next Follow-up; New sets it one day out", async () => {
  const sheet = sampleSheet()
  const api = apiFor(sheet)
  await updateLeadStatus(api, { kind: "qualified", id: "L-00000000B2", status: "Booked" }, NOW)
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000B2", "Next Follow-up"), "")
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000B2", "Status"), "Booked")
  await updateLeadStatus(api, { kind: "qualified", id: "L-00000000B2", status: "Lost" }, NOW)
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000B2", "Status"), "Lost")
  await updateLeadStatus(api, { kind: "qualified", id: "L-00000000B2", status: "New" }, NOW)
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000B2", "Next Follow-up"), "2026-10-18 12:00:00")
})

test("handoff leads are updated in the Handoffs tab, including leads with an unrecognised status", async () => {
  const sheet = sampleSheet()
  await updateLeadStatus(apiFor(sheet), { kind: "handoff", id: "H-00000000D4", status: "Contacted", expectedStatus: "maybe later" }, NOW)
  assert.equal(sheet.valueById("Handoffs", "Handoff ID", "H-00000000D4", "Status"), "Contacted")
  assert.equal(sheet.valueById("Handoffs", "Handoff ID", "H-00000000D4", "Status Updated (IST)"), "2026-10-17 12:00:00")
})

test("re-selecting the current status writes nothing", async () => {
  const sheet = sampleSheet()
  const r = await updateLeadStatus(apiFor(sheet), { kind: "qualified", id: "L-00000000A1", status: "New", expectedStatus: "New" }, NOW)
  assert.equal(r.unchanged, true)
  assert.equal(sheet.calls.some((c) => c.url.endsWith("/values:batchUpdate")), false)
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000A1", "Status Updated (IST)"), "2026-10-15 10:30:00")
})

test("a lead changed by someone else since the page loaded is not overwritten", async () => {
  const sheet = sampleSheet()
  await assert.rejects(
    updateLeadStatus(apiFor(sheet), { kind: "qualified", id: "L-00000000B2", status: "Lost", expectedStatus: "New" }, NOW),
    (err: unknown) => err instanceof LeadUpdateError && err.code === "conflict" && err.currentStatus === "Contacted",
  )
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000B2", "Status"), "Contacted")
})

test("unknown, duplicated and invalid leads are rejected without writing", async () => {
  const sheet = sampleSheet()
  const api = apiFor(sheet)
  await assert.rejects(updateLeadStatus(api, { kind: "qualified", id: "L-FFFFFFFFFF", status: "Booked" }, NOW), (e: unknown) => e instanceof LeadUpdateError && e.code === "not_found")
  sheet.tabs.get("Qualified Leads")!.rows.push(sheet.tabs.get("Qualified Leads")!.rows[1].slice())
  await assert.rejects(updateLeadStatus(api, { kind: "qualified", id: "L-00000000A1", status: "Booked" }, NOW), (e: unknown) => e instanceof LeadUpdateError && e.code === "duplicate_id")
  await assert.rejects(updateLeadStatus(api, { kind: "qualified", id: "L-1", status: "Done" as never }, NOW), (e: unknown) => e instanceof LeadUpdateError && e.code === "invalid_input")
  await assert.rejects(updateLeadStatus(api, { kind: "qualified", id: "'; DROP", status: "Booked" }, NOW), (e: unknown) => e instanceof LeadUpdateError && e.code === "invalid_input")
  assert.equal(sheet.calls.some((c) => c.url.endsWith("/values:batchUpdate")), false)
})

test("a tab without the Week 6 date columns gets only its Status changed", async () => {
  const sheet = new FakeGoogleSheets().addTab("Qualified Leads", [["Received (IST)", "Lead ID", "Status", "Phone"], ["2026-10-01 10:00:00", "L-00000000F6", "New", "'+919000000006"]])
  const r = await updateLeadStatus(apiFor(sheet), { kind: "qualified", id: "L-00000000F6", status: "Contacted" }, NOW)
  assert.equal(r.nextFollowUp, "")
  const update = sheet.calls.find((c) => c.url.endsWith("/values:batchUpdate"))
  assert.deepEqual(JSON.parse(update!.body!).data, [{ range: "'Qualified Leads'!C2", values: [["Contacted"]] }])
})

test("full flow: load a lead, change its status, reload (refresh) and the change is still there", async () => {
  const sheet = sampleSheet()
  const deps = { getConfig: () => ({ ok: true as const, config: configFor(sheet) }), createApi: () => apiFor(sheet), now: () => NOW.getTime() }
  const first = await loadLeads(deps)
  assert.equal(first.ok, true)
  const lead = first.ok ? first.leads.find((l) => l.id === "L-00000000A1")! : null
  assert.equal(lead!.status, "New")

  await updateLeadStatus(apiFor(sheet), { kind: lead!.kind, id: lead!.id, status: "Booked", expectedStatus: lead!.statusText }, NOW)

  const second = await loadLeads(deps)
  const reloaded = second.ok ? second.leads.find((l) => l.id === "L-00000000A1")! : null
  assert.equal(reloaded!.status, "Booked")
  assert.equal(reloaded!.statusUpdated, "2026-10-17 12:00:00")
  assert.equal(reloaded!.nextFollowUp, "")
  // Every other lead is unchanged.
  const others = (l: Lead[]) => l.filter((x) => x.id !== "L-00000000A1").map((x) => x.key + "=" + x.statusText)
  assert.deepEqual(second.ok && others(second.leads), first.ok && others(first.leads))
})

// ---------- page loader ----------

test("loadLeads: not configured, load failure and guest matching", async () => {
  assert.deepEqual(await loadLeads({ getConfig: () => ({ ok: false, missing: ["LEADS_SHEET_ID"] }), now: () => 1 }), { ok: false, code: "not_configured", missing: ["LEADS_SHEET_ID"], fetchedAt: 1 })

  const denied = sampleSheet()
  denied.failAlways = { match: "meta", status: 403 }
  const logged: unknown[] = []
  const failed = await loadLeads({ getConfig: () => ({ ok: true, config: configFor(denied) }), createApi: () => apiFor(denied), log: (e, d) => logged.push([e, d]) })
  assert.equal(failed.ok, false)
  assert.match(!failed.ok && failed.code === "load_failed" ? failed.message : "", /shared with the service account/)
  assert.doesNotMatch(JSON.stringify(logged), /\+91|secret-detail|PRIVATE KEY/)

  const sheet = sampleSheet()
  let asked: string[] = []
  const ok = await loadLeads({
    getConfig: () => ({ ok: true, config: configFor(sheet) }),
    createApi: () => apiFor(sheet),
    findGuestsByPhone: async (phones) => { asked = phones; return [{ id: "g1", name: "Asha Verma", phone: "+919000000002" }] },
  })
  assert.equal(ok.ok, true)
  assert.deepEqual(asked.sort(), ["+919000000001", "+919000000002", "+919000000003", "+919000000004"])
  if (ok.ok) {
    assert.deepEqual(ok.leads.find((l) => l.id === "L-00000000B2")!.guest, { id: "g1", name: "Asha Verma" })
    assert.equal(ok.leads.find((l) => l.id === "L-00000000A1")!.guest, null)
    assert.match(ok.sheetUrl, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1AbC.+\/edit$/)
  }

  const noDb = await loadLeads({
    getConfig: () => ({ ok: true, config: configFor(sheet) }),
    createApi: () => apiFor(sheet),
    findGuestsByPhone: async () => { throw new Error("db down") },
    log: () => {},
  })
  assert.equal(noDb.ok && noDb.leads.length, 4)
})

// ---------- search, filters, sorting ----------

async function sampleLeads(): Promise<Lead[]> {
  const sheet = sampleSheet()
  const { leads } = await listLeads(apiFor(sheet))
  leads[1].guest = { id: "g1", name: "Asha Verma" }
  return leads
}

test("search matches ID, phone digits (any formatting), place, notes and guest name", async () => {
  const leads = await sampleLeads()
  const ids = (q: string) => leads.filter((l) => matchesSearch(l, q)).map((l) => l.id)
  assert.deepEqual(ids("b2"), ["L-00000000B2"])
  assert.deepEqual(ids("90000 00003"), ["L-00000000C3"])
  assert.deepEqual(ids("+91 90000-00004"), ["H-00000000D4"])
  assert.deepEqual(ids("jaipur"), ["L-00000000A1", "L-00000000C3"])
  assert.deepEqual(ids("anniversary"), ["L-00000000A1"])
  assert.deepEqual(ids("asha"), ["L-00000000B2"])
  assert.equal(ids("").length, 4)
  assert.deepEqual(ids("zzz"), [])
})

test("status filters: open, follow-up due today (IST), single status and unrecognised", async () => {
  const leads = await sampleLeads()
  const now = NOW.getTime()
  const ids = (status: Parameters<typeof visibleLeads>[1]["status"]) =>
    visibleLeads(leads, { query: "", status, kind: "ALL", sort: "oldest" }, now).map((l) => l.id)
  assert.deepEqual(ids("OPEN"), ["L-00000000A1", "L-00000000B2"])
  assert.deepEqual(ids("DUE"), ["L-00000000A1"]) // B2's follow-up is tomorrow (18 Oct)
  assert.deepEqual(ids("Booked"), ["L-00000000C3"])
  assert.deepEqual(ids("OTHER"), ["H-00000000D4"])
  assert.deepEqual(visibleLeads(leads, { query: "", status: "ALL", kind: "handoff", sort: "newest" }, now).map((l) => l.id), ["H-00000000D4"])
})

test("follow-up due uses the India date, including late-evening follow-ups", async () => {
  const [lead] = await sampleLeads()
  const due = { ...lead, nextFollowUpMs: Date.parse("2026-10-17T18:00:00Z") } // 17 Oct 23:30 IST
  assert.equal(isFollowUpDue(due, NOW.getTime()), true)
  assert.equal(isFollowUpDue({ ...due, nextFollowUpMs: Date.parse("2026-10-17T18:31:00Z") }, NOW.getTime()), false) // 18 Oct 00:01 IST
  assert.equal(isFollowUpDue({ ...due, status: "Booked" }, NOW.getTime()), false)
  assert.equal(new Date(endOfTodayIst(NOW.getTime())).toISOString(), "2026-10-17T18:29:59.999Z")
})

test("sorting: newest, oldest, follow-up, check-in and score (empty values last)", async () => {
  const leads = await sampleLeads()
  const ids = (s: Parameters<typeof sortLeads>[1]) => sortLeads(leads, s).map((l) => l.id)
  assert.deepEqual(ids("newest"), ["H-00000000D4", "L-00000000B2", "L-00000000A1", "L-00000000C3"])
  assert.deepEqual(ids("oldest"), ["L-00000000C3", "L-00000000A1", "L-00000000B2", "H-00000000D4"])
  assert.deepEqual(ids("follow_up"), ["L-00000000A1", "L-00000000B2", "H-00000000D4", "L-00000000C3"])
  assert.deepEqual(ids("check_in"), ["L-00000000B2", "L-00000000A1", "H-00000000D4", "L-00000000C3"])
  assert.deepEqual(ids("score"), ["L-00000000A1", "L-00000000C3", "L-00000000B2", "H-00000000D4"])
})

test("countLeads summarises the tiles", async () => {
  const leads = await sampleLeads()
  assert.deepEqual(countLeads(leads, NOW.getTime()), { total: 4, open: 2, due: 1, New: 1, Contacted: 1, Booked: 1, Lost: 0, other: 1 })
  assert.deepEqual(countLeads([], NOW.getTime()), { total: 0, open: 0, due: 0, New: 0, Contacted: 0, Booked: 0, Lost: 0, other: 0 })
})

test("qualifiedRow helper stays aligned with the website's header list", () => {
  assert.equal(qualifiedRow({}).length, QUALIFIED_HEADERS.length)
})
