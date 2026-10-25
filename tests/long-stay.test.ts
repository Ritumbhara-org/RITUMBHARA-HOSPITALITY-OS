// Long Stays: nights, suggested totals, validation, file paths and the agreement snapshot/PDF.
// Run with: npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  aboutMonths, balanceDue, DEFAULT_DEPOSIT_TERMS, emptyLongStayInput, isBookingMediaPath, isLongStayPath, nightsBetween,
  normalizeLongStayInput, parseDateOnly, parseUploadPath, propertyTypeForUnitType, refundToGuest, suggestedTotal, validateLongStay,
  type LongStayInput,
} from "../lib/long-stay/shared"
import { agreementBadge, buildSnapshot, canonicalJson, isLinkUsable, materialKey, type SnapshotSource } from "../lib/long-stay/agreement"
import { buildSignedAgreementPdf, pdfSafe } from "../lib/long-stay/pdf"
import { isPublicPath } from "../lib/auth/policy"

const ID = "ls0123456789abcdef"

function valid(over: Partial<LongStayInput> = {}): LongStayInput {
  return {
    ...emptyLongStayInput(ID),
    guestName: "Asha Verma", contactNumber: "+91 98765 43210", idType: "Aadhaar", idNumber: "1234 5678 9012", propertyId: "prop1",
    propertyType: "1 BHK", checkIn: "2026-11-01", checkOut: "2027-02-01", inclusion: "UNIT_ELECTRICITY", rate: 25000, totalAmount: 76667,
    ...over,
  }
}

// ---------- nights ----------

test("nights: check-out day is not a night; 1 Nov to 1 Feb is 92", () => {
  assert.equal(nightsBetween("2026-11-01", "2027-02-01"), 92)
  assert.equal(nightsBetween("2026-11-01", "2026-11-02"), 1)
  assert.equal(nightsBetween("2026-11-01", "2026-11-01"), 0)
  assert.equal(nightsBetween("2026-11-05", "2026-11-01"), 0)
  assert.equal(nightsBetween("2028-02-01", "2028-03-01"), 29) // leap year
})

test("nights: across the IST/DST-free calendar, no off-by-one from time zones", () => {
  assert.equal(nightsBetween("2026-03-01", "2026-04-01"), 31)
  assert.equal(nightsBetween("2026-10-25", "2026-11-25"), 31)
})

test("dates: invalid or impossible dates are rejected", () => {
  assert.equal(parseDateOnly("2026-02-31"), null)
  assert.equal(parseDateOnly("01/11/2026"), null)
  assert.equal(parseDateOnly(""), null)
  assert.equal(nightsBetween("bad", "2026-11-02"), 0)
})

test("about X months shows for 30+ nights only", () => {
  assert.equal(aboutMonths(29), null)
  assert.equal(aboutMonths(30), "about 1 month")
  assert.equal(aboutMonths(92), "about 3 months")
  assert.equal(aboutMonths(45), "about 1.5 months")
})

// ---------- totals ----------

test("suggested total: ₹25,000/month for 92 nights is ₹76,667", () => {
  assert.equal(suggestedTotal("PER_MONTH", 25000, 92), 76667)
})

test("suggested total: per night is rate × nights; empty inputs give 0", () => {
  assert.equal(suggestedTotal("PER_NIGHT", 1800, 10), 18000)
  assert.equal(suggestedTotal("PER_MONTH", 30000, 30), 30000)
  assert.equal(suggestedTotal("PER_MONTH", 0, 30), 0)
  assert.equal(suggestedTotal("PER_NIGHT", 1800, 0), 0)
  assert.equal(suggestedTotal("PER_NIGHT", Number.NaN, 4), 0)
})

test("balance due and refund to guest", () => {
  assert.equal(balanceDue(76667, 25000), 51667)
  assert.equal(refundToGuest(50000, 3500), 46500)
  assert.equal(refundToGuest(50000, 0), 50000)
})

// ---------- validation ----------

test("validation: a complete booking passes", () => {
  assert.deepEqual(validateLongStay(valid()), {})
})

test("validation: required fields", () => {
  const e = validateLongStay(emptyLongStayInput(ID))
  for (const k of ["guestName", "contactNumber", "idType", "idNumber", "propertyId", "propertyType", "inclusion", "checkIn", "checkOut"]) {
    assert.ok(e[k as keyof LongStayInput], k + " should be required")
  }
  // optional ones are not
  for (const k of ["unitId", "email", "altContactNumber", "paymentMode", "notes"]) assert.equal(e[k as keyof LongStayInput], undefined, k)
})

test("validation: check-out must be at least 1 day after check-in", () => {
  assert.match(validateLongStay(valid({ checkOut: "2026-11-01" })).checkOut ?? "", /at least 1 day/)
  assert.match(validateLongStay(valid({ checkOut: "2026-10-30" })).checkOut ?? "", /at least 1 day/)
  assert.equal(validateLongStay(valid({ checkOut: "2026-11-02" })).checkOut, undefined)
})

test("validation: contact number needs 8–16 digits; email checked only if given", () => {
  assert.ok(validateLongStay(valid({ contactNumber: "1234567" })).contactNumber)
  assert.equal(validateLongStay(valid({ contactNumber: "12345678" })).contactNumber, undefined)
  assert.equal(validateLongStay(valid({ contactNumber: "+1234567890123456" })).contactNumber, undefined)
  assert.ok(validateLongStay(valid({ contactNumber: "+12345678901234567" })).contactNumber)
  assert.ok(validateLongStay(valid({ contactNumber: "98765abc43210" })).contactNumber)
  assert.ok(validateLongStay(valid({ altContactNumber: "123" })).altContactNumber)
  assert.ok(validateLongStay(valid({ email: "not-an-email" })).email)
  assert.equal(validateLongStay(valid({ email: "asha@example.com" })).email, undefined)
})

test("validation: no negative amounts; deduction can't exceed the deposit", () => {
  for (const k of ["rate", "totalAmount", "advancePaid", "securityDeposit", "depositDeduction"] as const) {
    assert.ok(validateLongStay(valid({ [k]: -1 })).hasOwnProperty(k), k)
  }
  assert.ok(validateLongStay(valid({ rate: Number.NaN })).rate)
  assert.match(validateLongStay(valid({ securityDeposit: 10000, depositDeduction: 12000 })).depositDeduction ?? "", /more than the deposit/)
  assert.equal(validateLongStay(valid({ securityDeposit: 10000, depositDeduction: 10000 })).depositDeduction, undefined)
})

test("validation: options must come from the lists", () => {
  assert.ok(validateLongStay(valid({ idType: "Ration card" })).idType)
  assert.ok(validateLongStay(valid({ propertyType: "Castle" })).propertyType)
  assert.ok(validateLongStay(valid({ inclusion: "EVERYTHING" })).inclusion)
  assert.ok(validateLongStay(valid({ status: "ARRIVED" })).status)
  assert.ok(validateLongStay(valid({ paymentMode: "Crypto" })).paymentMode)
  assert.ok(validateLongStay(valid({ id: "../../etc" })).id)
})

test("normalize: the server coerces whatever the browser sends", () => {
  const n = normalizeLongStayInput({ ...valid(), rate: "25000", occupants: "2", guestName: "  Asha  ", idDocuments: ["a", 5, null], status: undefined, extra: "x" })
  assert.equal(n.rate, 25000)
  assert.equal(n.occupants, 2)
  assert.equal(n.guestName, "Asha")
  assert.deepEqual(n.idDocuments, ["a"])
  assert.equal(n.status, "UPCOMING")
  assert.equal((n as unknown as Record<string, unknown>).extra, undefined)
  assert.deepEqual(normalizeLongStayInput(null).idDocuments, [])
})

test("new bookings start with the default deposit terms", () => {
  assert.equal(emptyLongStayInput(ID).depositTerms, DEFAULT_DEPOSIT_TERMS)
  assert.match(DEFAULT_DEPOSIT_TERMS, /7 working days/)
  assert.equal(DEFAULT_DEPOSIT_TERMS.split("\n").length, 7)
})

test("property type is filled from the unit's type when it clearly matches", () => {
  assert.equal(propertyTypeForUnitType("1BHK Apartment"), "1 BHK")
  assert.equal(propertyTypeForUnitType("2 bhk"), "2 BHK")
  assert.equal(propertyTypeForUnitType("Studio Deluxe"), "Studio")
  assert.equal(propertyTypeForUnitType("Private Villa"), "Villa")
  assert.equal(propertyTypeForUnitType("Deluxe Room"), "Room")
  assert.equal(propertyTypeForUnitType("Penthouse"), null)
})

// ---------- file paths ----------

test("files: uploads must stay under long-stay/<booking>/<kind>/", () => {
  assert.deepEqual(parseUploadPath(`long-stay/${ID}/checkin/kitchen.jpg`), { bookingId: ID, kind: "checkin" })
  assert.deepEqual(parseUploadPath(`long-stay/${ID}/id/aadhaar-front.pdf`), { bookingId: ID, kind: "id" })
  for (const bad of [
    "other/x.jpg", `long-stay/${ID}/agreement/sig.png`, `long-stay/${ID}/checkin/../../x.jpg`, `long-stay/${ID}/checkin/a/b.jpg`,
    `long-stay/short/checkin/x.jpg`, `/long-stay/${ID}/checkin/x.jpg`, `long-stay/${ID}/checkin/`,
  ]) {
    assert.equal(parseUploadPath(bad), null, bad)
  }
  assert.equal(isBookingMediaPath(ID, "checkin", `long-stay/${ID}/checkin/x.jpg`), true)
  assert.equal(isBookingMediaPath(ID, "checkout", `long-stay/${ID}/checkin/x.jpg`), false)
  assert.equal(isBookingMediaPath("lsOTHER0000000", "checkin", `long-stay/${ID}/checkin/x.jpg`), false)
  assert.equal(isLongStayPath(`long-stay/${ID}/agreement/agreement-x.pdf`), true)
  assert.equal(isLongStayPath("long-stay/../secrets.txt"), false)
  assert.equal(isLongStayPath("inbox/x.jpg"), false)
})

// ---------- agreement ----------

function source(over: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    id: ID, guestName: "Asha Verma", contactNumber: "+919876543210", idType: "Aadhaar", idNumber: "1234 5678 9012", propertyId: "prop1",
    unitId: "unit1", propertyType: "1 BHK", checkIn: "2026-11-01", checkOut: "2027-02-01", nights: 92, inclusion: "UNIT_ELECTRICITY",
    rateType: "PER_MONTH", rate: 25000, totalAmount: 76667, advancePaid: 25000, securityDeposit: 50000, depositTerms: DEFAULT_DEPOSIT_TERMS,
    property: { name: "Malviya Nagar", address: "Jaipur" }, unit: { name: "A-101" }, ...over,
  }
}

test("agreement: only the ID's last 4 digits are in the snapshot", () => {
  const s = buildSnapshot(source())
  assert.equal(s.idLast4, "9012")
  assert.ok(!JSON.stringify(s).includes("1234 5678"))
})

test("agreement: changing rent, dates, inclusion, deposit or terms changes the material key", () => {
  const base = materialKey(buildSnapshot(source()))
  for (const over of [
    { rate: 26000 }, { totalAmount: 80000 }, { checkOut: "2027-02-02" }, { inclusion: "ALL_INCLUSIVE" }, { securityDeposit: 40000 },
    { depositTerms: DEFAULT_DEPOSIT_TERMS + "\n8. No pets." }, { unitId: "unit2" }, { advancePaid: 0 },
  ] as Partial<SnapshotSource>[]) {
    assert.notEqual(materialKey(buildSnapshot(source(over))), base, JSON.stringify(over))
  }
  // Renaming a location in the OS or fixing the contact number doesn't void the signature.
  assert.equal(materialKey(buildSnapshot(source({ property: { name: "Renamed" }, contactNumber: "+919999999999" }))), base)
})

test("agreement: canonical JSON ignores key order", () => {
  assert.equal(canonicalJson({ b: 1, a: [1, { y: 2, x: 1 }] }), canonicalJson({ a: [1, { x: 1, y: 2 }], b: 1 }))
})

test("agreement: badge follows the newest agreement; links expire after 7 days or when locked", () => {
  const now = Date.now()
  const at = (minsAgo: number) => new Date(now - minsAgo * 60000)
  const future = new Date(now + 86400000)
  assert.equal(agreementBadge([]), "NOT_SENT")
  assert.equal(agreementBadge([{ status: "VOIDED", expiresAt: future, createdAt: at(10) }, { status: "VIEWED", expiresAt: future, createdAt: at(1) }]), "VIEWED")
  assert.equal(agreementBadge([{ status: "SIGNED", expiresAt: future, createdAt: at(1) }]), "SIGNED")
  assert.equal(isLinkUsable({ status: "SENT", expiresAt: future, createdAt: at(1) }), true)
  assert.equal(isLinkUsable({ status: "SENT", expiresAt: at(1), createdAt: at(10) }), false)
  assert.equal(isLinkUsable({ status: "VIEWED", expiresAt: future, lockedAt: at(1), createdAt: at(10) }), false)
  assert.equal(isLinkUsable({ status: "SIGNED", expiresAt: future, createdAt: at(10) }), false)
})

// 1×1 transparent PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"))

test("signed PDF: builds with the agreement and the audit trail on the last page", async () => {
  const pdf = await buildSignedAgreementPdf(buildSnapshot(source({ guestName: "आशा Verma" })), PNG, {
    signerName: "Asha Verma", signedAtIst: "25 Oct 2026, 1:00 pm IST", phoneVerified: "+919876543210", phoneVerifiedAtIst: "25 Oct 2026, 12:58 pm IST",
    ip: "203.0.113.5", userAgent: "Mozilla/5.0 (iPhone)", agreementHash: "a".repeat(64), agreementId: "agr1",
  })
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-")
  const { PDFDocument } = await import("pdf-lib")
  const doc = await PDFDocument.load(pdf)
  assert.ok(doc.getPageCount() >= 2)
  assert.equal(pdfSafe("₹25,000 — आशा"), "Rs.25,000 — ???")
})

// ---------- access ----------

test("access: only the signing page and its API are public, nothing else under long-stay", () => {
  assert.equal(isPublicPath("/sign/abcdef"), true)
  assert.equal(isPublicPath("/api/sign/abcdef/otp"), true)
  assert.equal(isPublicPath("/sign"), false)
  assert.equal(isPublicPath("/sign/"), false)
  assert.equal(isPublicPath("/signx/abc"), false)
  assert.equal(isPublicPath("/long-stay"), false)
  assert.equal(isPublicPath("/long-stay/new"), false)
  assert.equal(isPublicPath("/api/long-stay/media"), false)
  assert.equal(isPublicPath("/api/long-stay/upload"), false)
})
