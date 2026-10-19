// Week 7 Guest Messages on the Leads page: Sheet reading, send-window rules, the "mark as sent" bridge to the website's
// Apps Script, and the server action. Google is the in-memory fake; the Apps Script is a fake fetch. No network.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createGoogleSheetsApi } from "../lib/leads/google-sheets"
import { FakeGoogleSheets, sampleSheet } from "./helpers/fake-google-sheets"
import { SESSION_COOKIE } from "../lib/auth/session"
import { fakeCookies, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"
import type { MarkGuestMessageSentResult } from "../lib/guest-messages/types"
import { listGuestMessages, loadGuestMessages, markGuestMessageSent, getGuestMessageStatusConfig, parseGuestMessageRows } from "../lib/guest-messages/service"
import { guestMessagePhase, sortGuestMessages, countGuestMessages, matchesFilter, whatsAppDraftLink, istDay } from "../lib/guest-messages/view"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

const revalidated: string[] = []
mock.module("next/headers", nextHeadersMock)
mock.module("next/cache", { namedExports: { revalidatePath: (p: string) => { revalidated.push(p) } } })

// The exact header row the website's Apps Script writes (ritumbhara-live-v4 apps-script/Code.gs GUEST_MESSAGE_HEADERS).
const GM_HEADERS = ["Created (IST)", "Message ID", "Status", "Type", "Scheduled Date", "Send By", "Booking ID", "Booking Code",
  "Check-in", "Check-out", "Nights", "Guests", "Property", "Guest", "Guest WhatsApp", "Special Request", "Booking Source",
  "Reason", "Message", "Status Updated (IST)"]
type Raw = string | number | boolean
function gmRow(v: Partial<Record<string, Raw>>): Raw[] {
  return GM_HEADERS.map((h) => (v[h] === undefined ? "" : (v[h] as Raw)))
}
const MESSAGE = "Hi Asha,\n\nThis is Ritumbhara. We're looking forward to hosting you at Studio 925.\n\nBooking ref: RIAA004"

// 18 Oct 2026, 09:00 IST
const NOW = Date.parse("2026-10-18T03:30:00Z")
const STATUS_SECRET = "fake-guest-status-secret-0123456789abcdef"
const EXEC_URL = "https://script.google.com/macros/s/AKfycbFAKEdeploymentID_123/exec"

function sheetWithMessages(): FakeGoogleSheets {
  return sampleSheet().addTab("Guest Messages", [
    GM_HEADERS,
    gmRow({ "Created (IST)": "2026-10-16 09:00:00", "Message ID": "GM-0000000000A1", Status: "READY", Type: "PRE_ARRIVAL", "Scheduled Date": "2026-10-18", "Send By": "2026-10-19", "Booking ID": "4", "Booking Code": "RIAA004", "Check-in": "2026-10-20", "Check-out": "2026-10-22", Nights: 2, Guests: "2 adults", Property: "Studio 925", Guest: "Asha", "Guest WhatsApp": "'+919876543210", "Special Request": "no", "Booking Source": "Walk-In", Message: MESSAGE, "Status Updated (IST)": "2026-10-18 09:00:00" }),
    gmRow({ "Message ID": "GM-0000000000B2", Status: "QUEUED", Type: "CHECK_IN", "Scheduled Date": "2026-10-20", "Send By": "2026-10-20", "Booking Code": "RIAA004", "Guest WhatsApp": "'+919876543210", Message: "Check-in today" }),
    gmRow({ "Message ID": "GM-0000000000C3", Status: "FAILED", Type: "PRE_ARRIVAL", "Scheduled Date": "2026-10-18", "Send By": "2026-10-19", Reason: "no_guest_phone", Message: "Hi there" }),
    gmRow({ "Message ID": "GM-0000000000D4", Status: "READY", Type: "CHECKOUT", "Scheduled Date": "2026-10-15", "Send By": "2026-10-15", "Guest WhatsApp": "'+919000000001", Message: "Checkout today" }),
    gmRow({ "Message ID": "GM-0000000000E5", Status: "SENT", Type: "CHECK_IN", "Scheduled Date": "2026-10-17", "Send By": "2026-10-17", Message: "Welcome", "Status Updated (IST)": "2026-10-17 11:00:00" }),
    gmRow({ "Message ID": "GM-0000000000F6", Status: "SKIPPED", Type: "PRE_ARRIVAL", Reason: "status_cancelled", Message: "x" }),
    gmRow({ "Message ID": "", Status: "" }), // blank row
    gmRow({ "Message ID": "note: call guest", Status: "READY" }), // something the team typed: not a message
  ])
}
function apiFor(sheet: FakeGoogleSheets) {
  return createGoogleSheetsApi({ spreadsheetId: sheet.spreadsheetId, tokenSource: sheet.tokenSource(), fetchImpl: sheet.fetch })
}
const LEADS_CONFIG = {
  ok: true as const,
  config: { spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd", workloadIdentity: { projectId: "p", projectNumber: "1", serviceAccountEmail: "s@p.iam.gserviceaccount.com", poolId: "v", providerId: "v" } },
}

// ---------- reading the Sheet ----------

test("reads the Guest Messages tab by header name: dates, phone without the apostrophe, full message; non-messages ignored", async () => {
  const sheet = sheetWithMessages()
  const { messages, tabGid, tabMissing } = await listGuestMessages(apiFor(sheet))
  assert.equal(tabMissing, false)
  assert.equal(typeof tabGid, "number")
  assert.deepEqual(messages.map((m) => m.id), ["GM-0000000000A1", "GM-0000000000B2", "GM-0000000000C3", "GM-0000000000D4", "GM-0000000000E5", "GM-0000000000F6"])
  const a = messages[0]
  assert.equal(a.status, "READY")
  assert.equal(a.type, "PRE_ARRIVAL")
  assert.equal(a.bookingCode, "RIAA004")
  assert.equal(a.guest, "Asha")
  assert.equal(a.guestPhone, "+919876543210")
  assert.equal(a.property, "Studio 925")
  assert.equal(a.checkIn, "2026-10-20")
  assert.equal(a.checkOut, "2026-10-22")
  assert.equal(a.scheduledDate, "2026-10-18")
  assert.equal(a.sendBy, "2026-10-19")
  assert.equal(a.message, MESSAGE, "full multi-line text")
  assert.equal(a.row, 2)
  // Read-only: only GET requests were made to Google.
  assert.ok(sheet.calls.every((c) => c.method === "GET"))
})

test("dates stored as Sheet date serials are read as yyyy-MM-dd; a missing tab is reported, not an error", async () => {
  const header = GM_HEADERS
  const fmt = [header, gmRow({ "Message ID": "GM-0000000000A1", Status: "ready", "Scheduled Date": "18/10/2026", "Send By": "19/10/2026" })]
  const raw = [header, gmRow({ "Message ID": "GM-0000000000A1", Status: "ready", "Scheduled Date": 46313, "Send By": 46314 })]
  const [m] = parseGuestMessageRows(fmt, raw)
  assert.equal(m.scheduledDate, "2026-10-18")
  assert.equal(m.sendBy, "2026-10-19")
  assert.equal(m.status, "READY", "case-insensitive")
  const none = await listGuestMessages(apiFor(sampleSheet()))
  assert.deepEqual(none, { messages: [], tabGid: null, tabMissing: true })
})

// ---------- send-window rules (same as the website's Week 7 queue) ----------

test("phases: READY within Scheduled..Send By is send-now; past Send By is missed; FAILED needs a check; SENT/SKIPPED done", async () => {
  const { messages } = await listGuestMessages(apiFor(sheetWithMessages()))
  const today = "2026-10-18"
  const phase = Object.fromEntries(messages.map((m) => [m.id, guestMessagePhase(m, today)]))
  assert.deepEqual(phase, {
    "GM-0000000000A1": "send_now",
    "GM-0000000000B2": "upcoming",
    "GM-0000000000C3": "attention",
    "GM-0000000000D4": "missed",
    "GM-0000000000E5": "done",
    "GM-0000000000F6": "done",
  })
  assert.equal(guestMessagePhase(messages[0], "2026-10-19"), "send_now", "Send By day is still allowed")
  assert.equal(guestMessagePhase(messages[0], "2026-10-20"), "missed", "never late")
  assert.equal(guestMessagePhase({ ...messages[0], scheduledDate: "2026-10-19" }, "2026-10-18"), "upcoming", "not before its day")
  assert.equal(guestMessagePhase({ ...messages[0], status: null, statusText: "maybe" }, today), "attention")
  assert.deepEqual(sortGuestMessages(messages, today).map((m) => m.id).slice(0, 3), ["GM-0000000000A1", "GM-0000000000C3", "GM-0000000000B2"])
  assert.deepEqual(countGuestMessages(messages, today), { send_now: 1, attention: 1, upcoming: 1, missed: 1, done: 2 })
  assert.equal(matchesFilter("send_now", "ACTION"), true)
  assert.equal(matchesFilter("missed", "ACTION"), false, "a missed message is never offered for sending")
  assert.equal(istDay(NOW), "2026-10-18")
})

test("WhatsApp link only opens a chat with the text typed in (wa.me); nothing is sent", () => {
  assert.equal(whatsAppDraftLink("+91 98765 43210", "Hi Asha,\nsee you"), "https://wa.me/919876543210?text=Hi%20Asha%2C%0Asee%20you")
  assert.equal(whatsAppDraftLink("", "x"), null)
  assert.equal(whatsAppDraftLink("+919876543210", ""), "https://wa.me/919876543210")
})

// ---------- page loader ----------

test("loader: not connected, load failure (no Google detail leaked), and the mark-sent switch never exposes the secret", async () => {
  const notConfigured = await loadGuestMessages({ getConfig: () => ({ ok: false, missing: ["LEADS_SHEET_ID"] }), now: () => NOW })
  assert.deepEqual(notConfigured, { ok: false, code: "not_configured", missing: ["LEADS_SHEET_ID"], fetchedAt: NOW })

  const failing = sheetWithMessages()
  failing.failNext = { match: "meta", status: 500 }
  const logs: unknown[] = []
  const failed = await loadGuestMessages({ getConfig: () => LEADS_CONFIG, createApi: () => apiFor(failing), now: () => NOW, log: (e, d) => logs.push([e, d]) })
  assert.equal(failed.ok, false)
  assert.equal(!failed.ok && failed.code, "load_failed")
  assert.doesNotMatch(JSON.stringify([failed, logs]), /secret-detail|\+91/)

  const sheet = sheetWithMessages()
  const off = await loadGuestMessages({ getConfig: () => LEADS_CONFIG, createApi: () => apiFor(sheet), env: {}, now: () => NOW })
  assert.equal(off.ok && off.canMarkSent, false)
  assert.equal(off.ok && off.today, "2026-10-18")
  assert.equal(off.ok && off.messages.length, 6)
  const on = await loadGuestMessages({ getConfig: () => LEADS_CONFIG, createApi: () => apiFor(sheet), env: { GUEST_MESSAGES_SINK_URL: EXEC_URL, GUEST_MESSAGES_STATUS_SECRET: STATUS_SECRET }, now: () => NOW })
  assert.equal(on.ok && on.canMarkSent, true)
  assert.doesNotMatch(JSON.stringify(on), new RegExp(STATUS_SECRET + "|AKfycb"), "no secret and no Apps Script URL in page data")
})

// ---------- "mark as sent" bridge ----------

test("status config: only an Apps Script /exec URL and a 32+ character secret are accepted", () => {
  assert.deepEqual(getGuestMessageStatusConfig({}), { ok: false, missing: ["GUEST_MESSAGES_SINK_URL", "GUEST_MESSAGES_STATUS_SECRET"] })
  assert.deepEqual(getGuestMessageStatusConfig({ GUEST_MESSAGES_SINK_URL: "https://evil.example/exec", GUEST_MESSAGES_STATUS_SECRET: STATUS_SECRET }), { ok: false, missing: ["GUEST_MESSAGES_SINK_URL"] })
  assert.deepEqual(getGuestMessageStatusConfig({ GUEST_MESSAGES_SINK_URL: EXEC_URL, GUEST_MESSAGES_STATUS_SECRET: "short" }), { ok: false, missing: ["GUEST_MESSAGES_STATUS_SECRET"] })
  assert.equal(getGuestMessageStatusConfig({ GUEST_MESSAGES_SINK_URL: EXEC_URL, GUEST_MESSAGES_STATUS_SECRET: STATUS_SECRET }).ok, true)
})

function fakeAppsScript(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init || {} })
    if (reply instanceof Error) throw reply
    return new Response(typeof reply === "string" ? reply : JSON.stringify(reply), { status })
  }) as typeof fetch
  return { calls, fetchImpl }
}
const CFG = { url: EXEC_URL, secret: STATUS_SECRET }

test("bridge: posts only {type, secret, messageId} to the Apps Script and maps every reply; the secret never comes back", async () => {
  const ok = fakeAppsScript({ ok: true, updated: true, status: "SENT", statusUpdated: "2026-10-18 09:05:00" })
  const r = await markGuestMessageSent(CFG, "GM-0000000000A1", ok.fetchImpl)
  assert.deepEqual(r, { success: true, unchanged: false, statusUpdated: "2026-10-18 09:05:00" })
  assert.equal(ok.calls.length, 1)
  assert.equal(ok.calls[0].url, EXEC_URL)
  assert.equal(ok.calls[0].init.method, "POST")
  assert.deepEqual(JSON.parse(String(ok.calls[0].init.body)), { type: "guest_message_sent", secret: STATUS_SECRET, messageId: "GM-0000000000A1" })

  const cases: [unknown, number, string][] = [
    [{ ok: true, unchanged: true, status: "SENT" }, 200, "success"],
    [{ ok: false, error: "conflict", code: "NOT_READY", status: "SKIPPED" }, 200, "conflict"],
    [{ ok: false, error: "not_found", code: "NOT_FOUND" }, 200, "not_found"],
    [{ ok: false, error: "busy", code: "BUSY" }, 200, "busy"],
    [{ ok: false, error: "rejected", code: "AUTH" }, 200, "not_configured"],
    [{ ok: false, error: "rejected", code: "NO_SECRET_PROPERTY" }, 200, "not_configured"],
    [{ ok: false, error: "unauthorized" }, 200, "save_failed"], // an Apps Script version without the action
    ["<html>not json</html>", 200, "save_failed"],
    [{}, 500, "save_failed"],
    [new Error("network down"), 0, "save_failed"],
  ]
  for (const [reply, status, expected] of cases) {
    const f = fakeAppsScript(reply, status)
    const res = await markGuestMessageSent(CFG, "GM-0000000000A1", f.fetchImpl)
    assert.equal(res.success ? "success" : res.code, expected, JSON.stringify(reply))
    assert.doesNotMatch(JSON.stringify(res), new RegExp(STATUS_SECRET))
    if (expected === "conflict") assert.equal(!res.success && res.currentStatus, "SKIPPED")
  }
  // Invalid IDs and non-Apps-Script URLs never leave the server.
  const none = fakeAppsScript({})
  assert.equal(((await markGuestMessageSent(CFG, "GM-bad", none.fetchImpl)) as Extract<MarkGuestMessageSentResult, { success: false }>).code, "invalid_input")
  assert.equal(((await markGuestMessageSent({ url: "https://evil.example/exec", secret: STATUS_SECRET }, "GM-0000000000A1", none.fetchImpl)) as Extract<MarkGuestMessageSentResult, { success: false }>).code, "not_configured")
  assert.equal(none.calls.length, 0)
})

// ---------- server action ----------

const realFetch = globalThis.fetch
type Action = (input: unknown) => Promise<MarkGuestMessageSentResult>
async function loadAction(): Promise<Action> {
  return ((await import(mod("app/actions/guest-messages.ts"))) as { markGuestMessageSentAction: Action }).markGuestMessageSentAction
}

beforeEach(async () => {
  await setAuthEnv()
  fakeCookies.clear()
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  delete process.env.GUEST_MESSAGES_SINK_URL
  delete process.env.GUEST_MESSAGES_STATUS_SECRET
  revalidated.length = 0
  globalThis.fetch = realFetch
})

test("action: signed out or invalid input never reaches the Apps Script", async () => {
  process.env.GUEST_MESSAGES_SINK_URL = EXEC_URL
  process.env.GUEST_MESSAGES_STATUS_SECRET = STATUS_SECRET
  const f = fakeAppsScript({ ok: true, updated: true, status: "SENT" })
  globalThis.fetch = f.fetchImpl
  const action = await loadAction()
  fakeCookies.clear()
  assert.deepEqual(await action({ messageId: "GM-0000000000A1" }), { success: false, code: "unauthorized", error: "Your session has ended. Please sign in again." })
  fakeCookies.values.set(SESSION_COOKIE, "forged.token")
  assert.equal(((await action({ messageId: "GM-0000000000A1" })) as { code: string }).code, "unauthorized")
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  for (const bad of [{}, { messageId: "L-00000000A1" }, { messageId: "GM-0000000000a1" }, "GM-0000000000A1"]) {
    assert.equal(((await action(bad)) as { code: string }).code, "invalid_input", JSON.stringify(bad))
  }
  assert.equal(f.calls.length, 0)
  assert.deepEqual(revalidated, [])
})

test("action: not configured is explained (names only); configured marks SENT through the Apps Script and refreshes /leads", async () => {
  const f = fakeAppsScript({ ok: true, updated: true, status: "SENT", statusUpdated: "2026-10-18 09:05:00" })
  globalThis.fetch = f.fetchImpl
  const action = await loadAction()
  const off = await action({ messageId: "GM-0000000000A1" })
  assert.equal(!off.success && off.code, "not_configured")
  assert.match(!off.success ? off.error : "", /GUEST_MESSAGES_SINK_URL, GUEST_MESSAGES_STATUS_SECRET/)
  assert.equal(f.calls.length, 0)

  process.env.GUEST_MESSAGES_SINK_URL = EXEC_URL
  process.env.GUEST_MESSAGES_STATUS_SECRET = STATUS_SECRET
  const r = await action({ messageId: "GM-0000000000A1" })
  assert.deepEqual(r, { success: true, unchanged: false, statusUpdated: "2026-10-18 09:05:00" })
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].url, EXEC_URL, "only the Apps Script is called: no WhatsApp, no Intellistay")
  assert.deepEqual(revalidated, ["/leads"])
})
