// The Long Stay agreement a guest e-signs: snapshot shape, status helpers and the agreement text.
// Pure code (no server imports): used by the signing page, the PDF and the booking server action.

import { aboutMonths, idLast4, inclusionLabel, INCLUSIONS } from "./shared"

export const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
export const OTP_MAX_SENDS = 5
export const OTP_RESEND_GAP_MS = 60 * 1000
// After the OTP is verified the guest has this long to sign before it has to be verified again.
export const VERIFIED_WINDOW_MS = 30 * 60 * 1000

export const AGREEMENT_CONSENT = "I have read and agree to this agreement and the security deposit terms"

export interface AgreementSnapshot {
  version: 1
  bookingId: string
  guestName: string
  contactNumber: string
  idType: string
  idLast4: string
  propertyId: string
  locationName: string
  locationAddress: string
  unitId: string | null
  unitName: string | null
  propertyType: string
  checkIn: string // YYYY-MM-DD
  checkOut: string
  nights: number
  inclusion: string
  rateType: string
  rate: number
  totalAmount: number
  advancePaid: number
  securityDeposit: number
  depositTerms: string
}

export interface SnapshotSource {
  id: string
  guestName: string
  contactNumber: string
  idType: string
  idNumber: string
  propertyId: string
  unitId: string | null
  propertyType: string
  checkIn: string
  checkOut: string
  nights: number
  inclusion: string
  rateType: string
  rate: number
  totalAmount: number
  advancePaid: number
  securityDeposit: number
  depositTerms: string
  property: { name: string; address?: string | null }
  unit?: { name: string } | null
}

export function buildSnapshot(b: SnapshotSource): AgreementSnapshot {
  return {
    version: 1,
    bookingId: b.id,
    guestName: b.guestName.trim(),
    contactNumber: b.contactNumber.trim(),
    idType: b.idType,
    idLast4: idLast4(b.idNumber),
    propertyId: b.propertyId,
    locationName: b.property.name,
    locationAddress: b.property.address ?? "",
    unitId: b.unitId || null,
    unitName: b.unit?.name ?? null,
    propertyType: b.propertyType,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: b.nights,
    inclusion: b.inclusion,
    rateType: b.rateType,
    rate: b.rate,
    totalAmount: b.totalAmount,
    advancePaid: b.advancePaid,
    securityDeposit: b.securityDeposit,
    depositTerms: b.depositTerms.replace(/\r\n/g, "\n").trim(),
  }
}

// Stable JSON (sorted keys) so the same agreement always hashes the same.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]"
  const obj = value as Record<string, unknown>
  return "{" + Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}"
}

// The parts of the agreement whose change voids a signature: who, which unit, dates, inclusion, money and terms.
// Display names (location/unit renamed in the OS) and the contact number are left out on purpose.
export function materialKey(s: AgreementSnapshot): string {
  return canonicalJson({
    guestName: s.guestName, idType: s.idType, idLast4: s.idLast4, propertyId: s.propertyId, unitId: s.unitId,
    propertyType: s.propertyType, checkIn: s.checkIn, checkOut: s.checkOut, inclusion: s.inclusion, rateType: s.rateType,
    rate: s.rate, totalAmount: s.totalAmount, advancePaid: s.advancePaid, securityDeposit: s.securityDeposit,
    depositTerms: s.depositTerms,
  })
}

// ---------- status ----------

export type AgreementBadge = "NOT_SENT" | "SENT" | "VIEWED" | "SIGNED" | "VOIDED"

export interface AgreementLike {
  status: string
  expiresAt: Date | string
  lockedAt?: Date | string | null
  createdAt: Date | string
}

// The badge for a booking, from its agreements (any order). The newest agreement decides.
export function agreementBadge(agreements: AgreementLike[]): AgreementBadge {
  if (!agreements.length) return "NOT_SENT"
  const latest = [...agreements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  if (latest.status === "SIGNED") return "SIGNED"
  if (latest.status === "VOIDED") return "VOIDED"
  return latest.status === "VIEWED" ? "VIEWED" : "SENT"
}

export function isLinkUsable(a: AgreementLike, nowMs = Date.now()): boolean {
  return (a.status === "SENT" || a.status === "VIEWED") && !a.lockedAt && new Date(a.expiresAt).getTime() > nowMs
}

export const BADGE_LABEL: Record<AgreementBadge, string> = {
  NOT_SENT: "Not sent", SENT: "Sent", VIEWED: "Viewed", SIGNED: "Signed", VOIDED: "Voided",
}

// ---------- agreement text (signing page and PDF) ----------

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number)
  if (!y || !m || !day) return d
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${day} ${months[m - 1]} ${y}`
}

// currency: "₹" on screen; the PDF passes "Rs." because its built-in font has no rupee sign.
export function agreementSections(s: AgreementSnapshot, currency = "₹"): { title: string; rows: [string, string][]; text?: string }[] {
  const money = (n: number) => `${currency}${Math.round(n).toLocaleString("en-IN")}`
  const months = aboutMonths(s.nights)
  const inclusion = INCLUSIONS.find((i) => i.value === s.inclusion)
  return [
    {
      title: "Guest",
      rows: [
        ["Name", s.guestName],
        ["ID", `${s.idType} ending ${s.idLast4 || "—"}`],
      ],
    },
    {
      title: "Stay",
      rows: [
        ["Location", s.locationName + (s.locationAddress ? `, ${s.locationAddress}` : "")],
        ["Unit", s.unitName ? `${s.unitName} (${s.propertyType})` : s.propertyType],
        ["Check-in", fmtDate(s.checkIn)],
        ["Check-out", fmtDate(s.checkOut)],
        ["Nights", `${s.nights}${months ? ` (${months})` : ""}`],
        ["Included", inclusion ? `${inclusion.label}: ${inclusion.description}` : inclusionLabel(s.inclusion)],
      ],
    },
    {
      title: "Payment",
      rows: [
        ["Rent", `${money(s.rate)} ${s.rateType === "PER_NIGHT" ? "per night" : "per month"}`],
        ["Total for the stay", money(s.totalAmount)],
        ["Advance paid", money(s.advancePaid)],
        ["Balance due", money(Math.max(0, s.totalAmount - s.advancePaid))],
        ["Security deposit", money(s.securityDeposit)],
      ],
    },
    { title: "Security deposit terms", rows: [], text: s.depositTerms },
  ]
}
