// Long Stays e-sign and server actions, against an in-memory database and blob store:
// sending a link, OTP limits and lock-out, signing, check-in blocked until signed, signature voided when the rent changes,
// and every Long Stays action/route refusing signed-out calls.
// Run with: npm test
import { test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { NextRequest } from "next/server"
import { fakeCookies, fakeHeaders, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"
import { SESSION_COOKIE } from "../lib/auth/session"
import { DEFAULT_DEPOSIT_TERMS, emptyLongStayInput, type LongStayInput } from "../lib/long-stay/shared"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

// ---------- in-memory Prisma (only what Long Stays uses) ----------

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const db = {
  property: [] as Row[],
  unit: [] as Row[],
  longStayBooking: [] as Row[],
  longStayAgreement: [] as Row[],
  whatsAppMessage: [] as Row[],
}
let seq = 0

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (cond && typeof cond === "object" && !(cond instanceof Date) && "in" in cond) return (cond.in as unknown[]).includes(row[k])
    return (row[k] ?? null) === (cond ?? null)
  })
}
function apply(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in v) row[k] = (row[k] ?? 0) + v.increment
    else if (k === "property" && v?.connect) row.propertyId = v.connect.id
    else if (k === "unit") row.unitId = v?.connect ? v.connect.id : v?.disconnect ? null : row.unitId
    else if (v !== undefined) row[k] = v
  }
  row.updatedAt = new Date()
  return row
}
const clone = <T,>(x: T): T => structuredClone(x)

const prisma = {
  property: { findUnique: async ({ where }: Row) => clone(db.property.find((r) => r.id === where.id) ?? null) },
  unit: { findUnique: async ({ where }: Row) => clone(db.unit.find((r) => r.id === where.id) ?? null) },
  longStayBooking: {
    findUnique: async ({ where, include }: Row) => {
      const b = db.longStayBooking.find((r) => r.id === where.id)
      if (!b) return null
      const out = clone(b)
      if (include?.agreements) out.agreements = clone(db.longStayAgreement.filter((a) => a.bookingId === b.id))
      if (include?.property) out.property = clone(db.property.find((p) => p.id === b.propertyId))
      if (include?.unit) out.unit = b.unitId ? clone(db.unit.find((u) => u.id === b.unitId)) : null
      return out
    },
    upsert: async ({ where, create, update }: Row) => {
      const b = db.longStayBooking.find((r) => r.id === where.id)
      if (b) return clone(apply(b, update))
      const row = apply({ createdAt: new Date() }, create)
      db.longStayBooking.push(row)
      return clone(row)
    },
    update: async ({ where, data }: Row) => clone(apply(db.longStayBooking.find((r) => r.id === where.id)!, data)),
  },
  longStayAgreement: {
    findUnique: async ({ where, include }: Row) => {
      const a = db.longStayAgreement.find((r) => r.tokenHash === where.tokenHash)
      if (!a) return null
      const out = clone(a)
      if (include?.booking) out.booking = clone(db.longStayBooking.find((b) => b.id === a.bookingId))
      return out
    },
    create: async ({ data }: Row) => {
      const row = apply({ id: "agr" + ++seq, status: "SENT", otpAttempts: 0, otpSendCount: 0, createdAt: new Date(Date.now() + seq) }, data)
      db.longStayAgreement.push(row)
      return clone(row)
    },
    update: async ({ where, data }: Row) => clone(apply(db.longStayAgreement.find((r) => r.id === where.id)!, data)),
    updateMany: async ({ where, data }: Row) => {
      const rows = db.longStayAgreement.filter((r) => matches(r, where))
      rows.forEach((r) => apply(r, data))
      return { count: rows.length }
    },
  },
  whatsAppMessage: { create: async ({ data }: Row) => (db.whatsAppMessage.push(data), data) },
  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
}

const blobs = new Map<string, Uint8Array>()
const deleted: string[] = []
mock.module("next/headers", nextHeadersMock)
mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } })
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma }, defaultExport: prisma })
mock.module(mod("lib/long-stay/blob.ts"), {
  namedExports: {
    put: async (pathname: string, body: Uint8Array) => {
      const p = pathname.replace(/(\.\w+)$/, "-rnd$1")
      blobs.set(p, body)
      return { pathname: p, url: "https://blob.test/" + p }
    },
    del: async (p: string) => void deleted.push(p),
    get: async () => null,
  },
})

let actions: typeof import("../app/actions/long-stay")
let signing: typeof import("../lib/long-stay/signing")
let server: typeof import("../lib/long-stay/server")
before(async () => {
  actions = (await import(mod("app/actions/long-stay.ts"))) as typeof actions
  signing = (await import(mod("lib/long-stay/signing.ts"))) as typeof signing
  server = (await import(mod("lib/long-stay/server.ts"))) as typeof server
})

const ID = "ls00000000000000000000000000000001"
const PNG_DATA_URL =
  "data:image/png;base64," +
  Buffer.concat([
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
    Buffer.alloc(120), // pad past the minimum size check; trailing bytes after IEND are ignored by PNG readers
  ]).toString("base64")

function booking(over: Partial<LongStayInput> = {}): LongStayInput {
  return {
    ...emptyLongStayInput(ID),
    guestName: "Asha Verma", contactNumber: "9876543210", idType: "Passport", idNumber: "Z1234567", propertyId: "p1", unitId: "u1",
    propertyType: "1 BHK", checkIn: "2026-11-01", checkOut: "2027-02-01", inclusion: "UNIT_ELECTRICITY", rate: 25000, totalAmount: 76667,
    advancePaid: 25000, securityDeposit: 50000, depositTerms: DEFAULT_DEPOSIT_TERMS, ...over,
  }
}

function signIn() {
  fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
}

// Sends a link and returns its token (the action returns the full URL).
async function sendLink(): Promise<string> {
  const r = await actions.sendLongStayAgreement(ID, "whatsapp")
  assert.equal(r.success, true, JSON.stringify(r))
  return (r as { url: string }).url.split("/sign/")[1]
}

// The OTP is only stored as a keyed hash, so tests read it from the sandbox WhatsApp send.
let lastOtp = ""
const origLog = console.log
console.log = (...args: unknown[]) => {
  const m = /^\[Long Stay WhatsApp sandbox\].*?(\d{6}) is your Ritumbhara agreement code/.exec(String(args[0]))
  if (m) lastOtp = m[1]
  else origLog(...args)
}

async function verifyPhone(token: string, nowMs?: number) {
  const r = await signing.requestOtp(token, nowMs)
  assert.equal(r.ok, true, JSON.stringify(r))
  const v = await signing.verifyOtp(token, lastOtp, nowMs)
  assert.equal(v.ok, true, JSON.stringify(v))
}

function sign(token: string) {
  return signing.signAgreement(token, { name: "Asha Verma", signature: PNG_DATA_URL, agree: true, ip: "203.0.113.5", userAgent: "test", pdfBaseUrl: "https://os.test" })
}

beforeEach(async () => {
  await setAuthEnv()
  fakeCookies.clear()
  for (const k of Object.keys(db) as (keyof typeof db)[]) db[k].length = 0
  db.property.push({ id: "p1", name: "Malviya Nagar", address: "Jaipur" }, { id: "p2", name: "C-Scheme", address: "Jaipur" })
  db.unit.push({ id: "u1", name: "A-101", type: "1BHK", propertyId: "p1" }, { id: "u2", name: "B-201", type: "Studio", propertyId: "p2" })
  blobs.clear()
  deleted.length = 0
  fakeHeaders.set("host", "os.test")
  lastOtp = ""
})

// ---------- signed out ----------

test("signed out: every Long Stays action refuses before touching the database", async () => {
  for (const [name, fn] of Object.entries(actions)) {
    if (typeof fn !== "function") continue
    await assert.rejects((fn as (...a: unknown[]) => Promise<unknown>)(booking(), "checkin", "x"), (e: unknown) => (e as Error).name === "UnauthorizedError", name)
  }
  assert.equal(db.longStayBooking.length, 0)
})

test("signed out: upload and media routes answer 401", async () => {
  const upload = (await import(mod("app/api/long-stay/upload/route.ts"))) as { POST: (r: Request) => Promise<Response> }
  const media = (await import(mod("app/api/long-stay/media/route.ts"))) as { GET: (r: NextRequest) => Promise<Response> }
  const up = await upload.POST(new NextRequest("https://os.test/api/long-stay/upload", { method: "POST", body: "{}" }))
  assert.equal(up.status, 401)
  const m = await media.GET(new NextRequest(`https://os.test/api/long-stay/media?path=long-stay/${ID}/checkin/a.jpg`))
  assert.equal(m.status, 401)
})

test("signed in: media route refuses paths outside long-stay/", async () => {
  signIn()
  const media = (await import(mod("app/api/long-stay/media/route.ts"))) as { GET: (r: NextRequest) => Promise<Response> }
  for (const p of ["inbox/a.jpg", "long-stay/../x", ""]) {
    const res = await media.GET(new NextRequest("https://os.test/api/long-stay/media?path=" + encodeURIComponent(p)))
    assert.equal(res.status, 400, p)
  }
})

// ---------- saving ----------

test("save: creates the booking with server-calculated nights and only this booking's files", async () => {
  signIn()
  const r = await actions.saveLongStayBooking({
    ...booking(), checkInMedia: [`long-stay/${ID}/checkin/a.jpg`, `long-stay/lsSOMEONEELSE00000/checkin/b.jpg`, "../x"],
  })
  assert.equal(r.success, true, JSON.stringify(r))
  const b = db.longStayBooking[0]
  assert.equal(b.nights, 92)
  assert.deepEqual(b.checkInMedia, [`long-stay/${ID}/checkin/a.jpg`])
  assert.equal(b.termsAccepted, false)
})

test("save: unit must belong to the chosen location; server re-validates", async () => {
  signIn()
  const r = await actions.saveLongStayBooking(booking({ unitId: "u2" }))
  assert.equal(r.success, false)
  assert.ok(!r.success && r.errors?.unitId)
  const r2 = await actions.saveLongStayBooking(booking({ checkOut: "2026-10-01" }))
  assert.ok(!r2.success && r2.errors?.checkOut)
  assert.equal(db.longStayBooking.length, 0)
})

test("save: can't set Checked in before the guest has signed", async () => {
  signIn()
  const r = await actions.saveLongStayBooking(booking({ status: "CHECKED_IN" }))
  assert.equal(r.success, false)
  assert.match(!r.success ? r.errors?.status ?? "" : "", /e-sign/)
  assert.equal((await actions.saveLongStayBooking(booking())).success, true)
  const r2 = await actions.saveLongStayBooking(booking({ status: "CHECKED_IN" }))
  assert.equal(r2.success, false)
})

// ---------- e-sign ----------

test("e-sign: send → viewed → OTP → sign → status Signed, PDF stored, check-in allowed", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  const a = db.longStayAgreement[0]
  assert.equal(a.status, "SENT")
  assert.notEqual(a.tokenHash, token) // only the hash is stored
  assert.equal(a.tokenHash, server.hashToken(token))
  assert.equal(a.snapshot.idLast4, "4567")
  assert.ok(db.whatsAppMessage.some((m) => String(m.content).includes("/sign/" + token)))

  const found = await signing.findAgreementByToken(token)
  await signing.markViewed(found!)
  assert.equal(db.longStayAgreement[0].status, "VIEWED")

  // Signing without the OTP is refused.
  const early = await sign(token)
  assert.equal(early.ok, false)

  await verifyPhone(token)
  assert.ok(!db.whatsAppMessage.some((m) => String(m.content).includes(lastOtp)), "OTP must not be logged")
  const r = await sign(token)
  assert.equal(r.ok, true, JSON.stringify(r))
  const signed = db.longStayAgreement[0]
  assert.equal(signed.status, "SIGNED")
  assert.equal(signed.signerName, "Asha Verma")
  assert.equal(signed.signerIp, "203.0.113.5")
  assert.match(signed.pdfPath, new RegExp(`^long-stay/${ID}/agreement/agreement-.*\\.pdf$`))
  assert.match(signed.signaturePath, new RegExp(`^long-stay/${ID}/agreement/signature-.*\\.png$`))
  assert.equal(Buffer.from(blobs.get(signed.pdfPath)!.slice(0, 5)).toString(), "%PDF-")
  assert.equal(db.longStayBooking[0].termsAccepted, true)
  assert.equal(signing.signingState(await signing.findAgreementByToken(token)), "SIGNED")

  // Signing twice is refused; now check-in is allowed.
  assert.equal((await sign(token)).ok, false)
  const checkIn = await actions.saveLongStayBooking(booking({ status: "CHECKED_IN" }))
  assert.equal(checkIn.success, true, JSON.stringify(checkIn))
})

test("e-sign: changing the rent after signing voids the signature and needs a new link", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  await verifyPhone(token)
  assert.equal((await sign(token)).ok, true)

  // Fixing the phone number doesn't void it...
  const same = await actions.saveLongStayBooking(booking({ contactNumber: "9876543211", notes: "late arrival" }))
  assert.equal(same.success && same.voidedSignature, false)
  assert.equal(db.longStayAgreement[0].status, "SIGNED")

  // ...changing the rent does.
  const r = await actions.saveLongStayBooking(booking({ contactNumber: "9876543211", rate: 27000 }))
  assert.equal(r.success && r.voidedSignature, true)
  assert.equal(db.longStayAgreement[0].status, "VOIDED")
  assert.equal(db.longStayBooking[0].termsAccepted, false)
  assert.equal((await actions.saveLongStayBooking(booking({ contactNumber: "9876543211", rate: 27000, status: "CHECKED_IN" }))).success, false)

  const next = await sendLink()
  assert.notEqual(next, token)
  assert.equal(db.longStayAgreement[1].snapshot.rate, 27000)
})

test("e-sign: changing the booking while a link is out voids that link", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  await actions.saveLongStayBooking(booking({ checkOut: "2027-03-01" }))
  assert.equal(signing.signingState(await signing.findAgreementByToken(token)), "VOIDED")
  assert.equal((await signing.requestOtp(token)).ok, false)
})

test("e-sign: 5 wrong codes lock the link", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  assert.equal((await signing.requestOtp(token)).ok, true)
  const wrong = lastOtp === "000000" ? "111111" : "000000"
  for (let i = 1; i <= 4; i++) {
    const r = await signing.verifyOtp(token, wrong)
    assert.equal(r.ok, false)
    assert.equal(!r.ok && r.data?.attemptsLeft, 5 - i)
  }
  const last = await signing.verifyOtp(token, wrong)
  assert.equal(!last.ok && last.status, 423)
  assert.equal(signing.signingState(await signing.findAgreementByToken(token)), "LOCKED")
  // Even the right code is refused now.
  assert.equal((await signing.verifyOtp(token, lastOtp)).ok, false)
})

test("e-sign: OTP expires after 10 minutes; codes are rate-limited", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  const t0 = Date.now()
  assert.equal((await signing.requestOtp(token, t0)).ok, true)
  const again = await signing.requestOtp(token, t0 + 5000)
  assert.equal(!again.ok && again.status, 429)
  const expired = await signing.verifyOtp(token, lastOtp, t0 + 11 * 60 * 1000)
  assert.equal(expired.ok, false)
  assert.match(!expired.ok ? expired.error : "", /expired/)
  for (let i = 1; i < 5; i++) assert.equal((await signing.requestOtp(token, t0 + i * 61000)).ok, true, "send " + (i + 1))
  const sixth = await signing.requestOtp(token, t0 + 10 * 61000)
  assert.equal(!sixth.ok && sixth.status, 429)
})

test("e-sign: expired links show a clear message; bad tokens find nothing", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  const eightDays = Date.now() + 8 * 24 * 60 * 60 * 1000
  assert.equal(signing.signingState(await signing.findAgreementByToken(token), eightDays), "EXPIRED")
  const r = await signing.requestOtp(token, eightDays)
  assert.match(!r.ok ? r.error : "", /expired/)
  assert.equal(await signing.findAgreementByToken("not-a-token"), null)
  assert.equal(await signing.findAgreementByToken("a".repeat(43)), null)
})

test("e-sign: resending replaces the old link; cancel voids it", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const first = await sendLink()
  const second = await sendLink()
  assert.equal(signing.signingState(await signing.findAgreementByToken(first)), "VOIDED")
  assert.equal(signing.signingState(await signing.findAgreementByToken(second)), "ACTIVE")
  await actions.cancelLongStayAgreement(ID)
  assert.equal(signing.signingState(await signing.findAgreementByToken(second)), "VOIDED")
})

test("e-sign: a tampered snapshot can't be signed", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  await verifyPhone(token)
  db.longStayAgreement[0].snapshot.rate = 1
  const r = await sign(token)
  assert.equal(!r.ok && r.status, 409)
})

test("e-sign: signature must be a real PNG and the box must be ticked", async () => {
  signIn()
  await actions.saveLongStayBooking(booking())
  const token = await sendLink()
  await verifyPhone(token)
  const base = { name: "Asha Verma", ip: "", userAgent: "", pdfBaseUrl: "https://os.test" }
  assert.equal((await signing.signAgreement(token, { ...base, signature: PNG_DATA_URL, agree: false })).ok, false)
  assert.equal((await signing.signAgreement(token, { ...base, signature: "data:image/png;base64,AAAA", agree: true })).ok, false)
  assert.equal((await signing.signAgreement(token, { ...base, name: "A", signature: PNG_DATA_URL, agree: true })).ok, false)
  assert.equal(db.longStayAgreement[0].status, "VIEWED")
})

test("files: delete only removes this booking's files", async () => {
  signIn()
  const p = `long-stay/${ID}/checkin/a.jpg`
  await actions.saveLongStayBooking({ ...booking(), checkInMedia: [p] })
  assert.equal((await actions.deleteLongStayMedia(ID, "checkin", `long-stay/lsOTHER000000000/checkin/a.jpg`)).success, false)
  assert.equal((await actions.deleteLongStayMedia(ID, "checkin", p)).success, true)
  assert.deepEqual(deleted, [p])
  assert.deepEqual(db.longStayBooking[0].checkInMedia, [])
})
