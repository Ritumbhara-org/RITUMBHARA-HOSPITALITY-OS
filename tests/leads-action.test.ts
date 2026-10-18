// Server action + page tests for the Leads tab. Google is replaced by the in-memory fake behind global fetch, so
// the real action -> service -> Google client -> Sheet path runs end to end. next/cache and Prisma are mocked.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { clearTokenCache } from "../lib/leads/google-sheets"
import { sampleSheet, TEST_PRIVATE_KEY, type FakeGoogleSheets } from "./helpers/fake-google-sheets"
import type { LeadsLoadResult, UpdateLeadStatusResult } from "../lib/leads/types"
import { SESSION_COOKIE } from "../lib/auth/session"
import { clearAuthEnv, fakeCookies, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

const revalidated: string[] = []
const guestQueries: unknown[] = []
mock.module("next/headers", nextHeadersMock)
mock.module("next/cache", { namedExports: { revalidatePath: (p: string) => { revalidated.push(p) } } })
mock.module(mod("lib/prisma.ts"), {
  namedExports: {
    prisma: {
      guest: {
        findMany: async (args: unknown) => {
          guestQueries.push(args)
          return [{ id: "guest-1", name: "Asha Verma", phone: "+919000000002" }]
        },
      },
    },
  },
})

type Action = (input: unknown) => Promise<UpdateLeadStatusResult>
async function loadAction(): Promise<Action> {
  return ((await import(mod("app/actions/leads.ts"))) as { updateLeadStatusAction: Action }).updateLeadStatusAction
}
async function loadPage(): Promise<() => Promise<{ props: { data: LeadsLoadResult } }>> {
  return ((await import(mod("app/(dashboard)/leads/page.tsx"))) as { default: () => Promise<{ props: { data: LeadsLoadResult } }> }).default
}

const ENV_KEYS = ["LEADS_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] as const
let sheet: FakeGoogleSheets
const realFetch = globalThis.fetch

function connect(s: FakeGoogleSheets) {
  process.env.LEADS_SHEET_ID = s.spreadsheetId
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "leads@ritumbhara-os.iam.gserviceaccount.com"
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = TEST_PRIVATE_KEY.privateKey.replace(/\n/g, "\\n")
  globalThis.fetch = s.fetch
}

// Signs the test admin in (valid session cookie). Tests for signed-out behaviour call signOut().
async function signIn() {
  await setAuthEnv()
  fakeCookies.clear()
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
}
function signOut() {
  fakeCookies.clear()
}

beforeEach(async () => {
  for (const k of ENV_KEYS) delete process.env[k]
  await signIn()
  globalThis.fetch = realFetch
  clearTokenCache()
  revalidated.length = 0
  guestQueries.length = 0
  sheet = sampleSheet()
})

test("action: saves the status to the Sheet and revalidates /leads", async () => {
  connect(sheet)
  const action = await loadAction()
  const r = await action({ kind: "qualified", id: "L-00000000A1", status: "Contacted", expectedStatus: "New" })
  assert.equal(r.success, true)
  assert.equal(r.success && r.status, "Contacted")
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000A1", "Status"), "Contacted")
  assert.deepEqual(revalidated, ["/leads"])
})

test("action: rejects malformed input before touching the Sheet", async () => {
  connect(sheet)
  const action = await loadAction()
  for (const bad of [null, {}, { kind: "clicks", id: "L-00000000A1", status: "New" }, { kind: "qualified", id: "L-00000000A1", status: "Won" }, { kind: "qualified", id: "=HYPERLINK(1)", status: "New" }]) {
    const r = await action(bad)
    assert.deepEqual(r, { success: false, code: "invalid_input", error: "That status change is not valid." })
  }
  assert.equal(sheet.calls.length, 0)
})

test("action: not configured -> clear message naming the missing settings only", async () => {
  const action = await loadAction()
  const r = await action({ kind: "qualified", id: "L-00000000A1", status: "Booked" })
  assert.equal(r.success, false)
  assert.equal(!r.success && r.code, "not_configured")
  assert.match(!r.success ? r.error : "", /LEADS_SHEET_ID/)
})

test("action: conflict returns the current status and refreshes the page; nothing is written", async () => {
  connect(sheet)
  const action = await loadAction()
  const r = await action({ kind: "qualified", id: "L-00000000B2", status: "Lost", expectedStatus: "New" })
  assert.equal(!r.success && r.code, "conflict")
  assert.equal(!r.success && r.currentStatus, "Contacted")
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000B2", "Status"), "Contacted")
  assert.deepEqual(revalidated, ["/leads"])
})

test("action: Google refusing the edit gives a sharing hint and no internal detail", async () => {
  connect(sheet)
  sheet.failNext = { match: "update", status: 403 }
  const errors: unknown[] = []
  const origError = console.error
  console.error = (...args: unknown[]) => { errors.push(args) }
  try {
    const action = await loadAction()
    const r = await action({ kind: "qualified", id: "L-00000000A1", status: "Booked", expectedStatus: "New" })
    assert.equal(!r.success && r.code, "save_failed")
    assert.match(!r.success ? r.error : "", /shared with the service account/)
    assert.doesNotMatch(JSON.stringify([r, errors]), /secret-detail|\+91|PRIVATE KEY|fake-token/)
  } finally {
    console.error = origError
  }
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000A1", "Status"), "New")
})

test("page: loads real Sheet leads, links matching OS guests, and a refresh after an update shows the new status", async () => {
  connect(sheet)
  const page = await loadPage()
  const first = (await page()).props.data
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(first.leads.length, 4)
  assert.deepEqual(first.leads.find((l) => l.id === "L-00000000B2")!.guest, { id: "guest-1", name: "Asha Verma" })
  assert.equal(guestQueries.length, 1)

  const action = await loadAction()
  const r = await action({ kind: "handoff", id: "H-00000000D4", status: "Contacted", expectedStatus: "maybe later" })
  assert.equal(r.success, true)

  const second = (await page()).props.data
  assert.equal(second.ok && second.leads.find((l) => l.id === "H-00000000D4")!.status, "Contacted")
})

test("page: unconfigured OS shows the not-connected state instead of failing", async () => {
  const page = await loadPage()
  const data = (await page()).props.data
  assert.equal(data.ok, false)
  assert.equal(!data.ok && data.code, "not_configured")
})

// ---------- authentication ----------

test("signed out: the action refuses to read or change the Sheet", async () => {
  connect(sheet)
  signOut()
  const action = await loadAction()
  const r = await action({ kind: "qualified", id: "L-00000000A1", status: "Booked", expectedStatus: "New" })
  assert.deepEqual(r, { success: false, code: "unauthorized", error: "Your session has ended. Please sign in again." })
  assert.equal(sheet.calls.length, 0)
  assert.equal(sheet.valueById("Qualified Leads", "Lead ID", "L-00000000A1", "Status"), "New")
  assert.deepEqual(revalidated, [])
})

test("forged, tampered and expired session cookies are refused by the action", async () => {
  connect(sheet)
  const action = await loadAction()
  const good = validSessionToken()
  const [body, sig] = good.split(".")
  const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), exp: 9999999999 })).toString("base64url")
  const expired = validSessionToken(Date.now() - 13 * 60 * 60 * 1000)
  for (const token of ["admin", "true", forgedBody + "." + sig, body + "." + sig.slice(0, -2) + "AA", expired]) {
    fakeCookies.values.set(SESSION_COOKIE, token)
    const r = await action({ kind: "qualified", id: "L-00000000A1", status: "Booked" })
    assert.equal(!r.success && r.code, "unauthorized", token.slice(0, 12))
  }
  assert.equal(sheet.calls.length, 0)
})

test("auth not configured on the server: the action fails closed even with a cookie", async () => {
  connect(sheet)
  clearAuthEnv()
  const action = await loadAction()
  const r = await action({ kind: "qualified", id: "L-00000000A1", status: "Booked" })
  assert.equal(!r.success && r.code, "unauthorized")
  assert.equal(sheet.calls.length, 0)
})

test("signed out: the Leads page redirects to /login and never loads leads", async () => {
  connect(sheet)
  signOut()
  const page = await loadPage()
  await assert.rejects(page(), (err: unknown) => {
    const digest = String((err as { digest?: string }).digest || "")
    assert.match(digest, /^NEXT_REDIRECT;.*\/login\?next=%2Fleads/)
    return true
  })
  assert.equal(sheet.calls.length, 0)
  assert.equal(guestQueries.length, 0)
})
