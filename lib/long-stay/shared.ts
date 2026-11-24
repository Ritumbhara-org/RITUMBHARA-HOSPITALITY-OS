// Long Stays: options, default deposit terms, nights/total helpers and validation.
// Pure code with no server imports, so the booking form (browser) and the server action share the same rules.

export const ID_TYPES = ["Aadhaar", "Passport", "Driving Licence", "Voter ID", "PAN"] as const
export const PROPERTY_TYPES = ["Studio", "1 BHK", "2 BHK", "3 BHK", "Villa", "Room"] as const
export const PAYMENT_MODES = ["UPI", "Bank transfer", "Cash", "Card", "Cheque"] as const

export const STATUSES = [
  { value: "UPCOMING", label: "Upcoming" },
  { value: "CHECKED_IN", label: "Checked in" },
  { value: "CHECKED_OUT", label: "Checked out" },
  { value: "CANCELLED", label: "Cancelled" },
] as const

export const INCLUSIONS = [
  { value: "UNIT_ONLY", label: "Unit only", description: "Rent for the unit. Bills extra." },
  { value: "UNIT_ELECTRICITY", label: "Unit + Electricity", description: "Rent and electricity." },
  { value: "UNIT_ELECTRICITY_MAINTENANCE", label: "Unit + Electricity + Society maintenance", description: "Rent, electricity and society charges." },
  {
    value: "ALL_INCLUSIVE",
    label: "All inclusive + Housekeeping",
    description: "Everything, plus bedsheet and towel change 3 times a week.",
  },
] as const

export const RATE_TYPES = [
  { value: "PER_MONTH", label: "Per month" },
  { value: "PER_NIGHT", label: "Per night" },
] as const

export type LongStayStatusValue = (typeof STATUSES)[number]["value"]
export type InclusionValue = (typeof INCLUSIONS)[number]["value"]
export type RateTypeValue = (typeof RATE_TYPES)[number]["value"]

export const MEDIA_KINDS = ["id", "checkin", "checkout"] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

export const DEFAULT_DEPOSIT_TERMS = [
  "1. The security deposit is refundable and is not adjusted against rent.",
  "2. It is refunded within 7 working days of check-out, after the unit inspection.",
  "3. Deductions apply for damage, missing items, unpaid bills, extra cleaning or lost keys/cards.",
  "4. The check-in and check-out photos/videos are the record of the unit's condition.",
  "5. Leaving before the booked check-out date needs 15 days' written notice; otherwise up to 15 days' rent may be deducted.",
  "6. The deposit is not refunded if the stay is ended for breaking house rules (smoking indoors, illegal activity, nuisance to neighbours).",
  "7. The refund is made only to the account the deposit was paid from.",
].join("\n")

export function inclusionLabel(value: string): string {
  return INCLUSIONS.find((i) => i.value === value)?.label ?? value
}
export function statusLabel(value: string): string {
  return STATUSES.find((s) => s.value === value)?.label ?? value
}

// ---------- dates and money ----------

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// "2026-11-01" -> UTC midnight in ms, or null. Rejects impossible dates like 2026-02-31.
export function parseDateOnly(value: string | null | undefined): number | null {
  const m = DATE_RE.exec((value ?? "").trim())
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(ms)
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  return ms
}

// Date -> "YYYY-MM-DD" (UTC, which is how DATE columns come back from Prisma).
export function toDateOnly(value: Date | string | null | undefined): string {
  if (!value) return ""
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

// Nights = check-out − check-in. The check-out day is not a night. 1 Nov -> 1 Feb = 92.
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = parseDateOnly(checkIn)
  const b = parseDateOnly(checkOut)
  if (a === null || b === null) return 0
  return Math.max(0, Math.round((b - a) / DAY_MS))
}

// Per night: rate × nights. Per month: rate ÷ 30 × nights, rounded to the rupee. ₹25,000/month × 92 nights = ₹76,667.
export function suggestedTotal(rateType: string, rate: number, nights: number): number {
  if (!Number.isFinite(rate) || rate <= 0 || nights <= 0) return 0
  if (rateType === "PER_NIGHT") return Math.round(rate * nights)
  return Math.round((rate / 30) * nights)
}

export function balanceDue(total: number, advance: number): number {
  return round2((Number(total) || 0) - (Number(advance) || 0))
}

export function refundToGuest(deposit: number, deduction: number): number {
  return round2((Number(deposit) || 0) - (Number(deduction) || 0))
}

// "about 3 months" for stays of 30+ nights, else null. Rounded to the nearest half month.
export function aboutMonths(nights: number): string | null {
  if (nights < 30) return null
  const months = Math.round((nights / 30) * 2) / 2
  return `about ${months} ${months === 1 ? "month" : "months"}`
}

export function formatInr(amount: number): string {
  return "₹" + Math.round(Number(amount) || 0).toLocaleString("en-IN")
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Unit.type is free text in the Units table; map it onto a property type option when it clearly matches.
export function propertyTypeForUnitType(unitType: string | null | undefined): string | null {
  const t = (unitType ?? "").toLowerCase().replace(/\s+/g, " ").trim()
  if (!t) return null
  for (const n of ["1", "2", "3"]) {
    if (new RegExp(`\\b${n} ?bhk\\b`).test(t)) return `${n} BHK`
  }
  if (t.includes("studio")) return "Studio"
  if (t.includes("villa")) return "Villa"
  if (t.includes("room")) return "Room"
  return null
}

export function idLast4(idNumber: string): string {
  const clean = (idNumber ?? "").replace(/[\s-]/g, "")
  return clean.slice(-4)
}

// ---------- validation (browser and server) ----------

export interface LongStayInput {
  id: string
  status: string
  guestName: string
  contactNumber: string
  altContactNumber: string
  email: string
  occupants: number
  emergencyContact: string
  idType: string
  idNumber: string
  propertyId: string
  unitId: string
  propertyType: string
  checkIn: string
  checkOut: string
  inclusion: string
  rateType: string
  rate: number
  totalAmount: number
  advancePaid: number
  paymentMode: string
  securityDeposit: number
  depositMode: string
  depositTerms: string
  depositDeduction: number
  deductionReason: string
  depositRefundedOn: string
  idDocuments: string[]
  checkInMedia: string[]
  checkOutMedia: string[]
  notes: string
}

export type LongStayErrors = Partial<Record<keyof LongStayInput, string>>

export function emptyLongStayInput(id: string): LongStayInput {
  return {
    id, status: "UPCOMING", guestName: "", contactNumber: "", altContactNumber: "", email: "", occupants: 1,
    emergencyContact: "", idType: "", idNumber: "", propertyId: "", unitId: "", propertyType: "", checkIn: "", checkOut: "",
    inclusion: "", rateType: "PER_MONTH", rate: 0, totalAmount: 0, advancePaid: 0, paymentMode: "", securityDeposit: 0,
    depositMode: "", depositTerms: DEFAULT_DEPOSIT_TERMS, depositDeduction: 0, deductionReason: "", depositRefundedOn: "",
    idDocuments: [], checkInMedia: [], checkOutMedia: [], notes: "",
  }
}

// Server side: turn whatever the browser sent into a well-typed input (strings trimmed, numbers parsed, lists of strings).
export function normalizeLongStayInput(raw: unknown): LongStayInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const str = (k: string, max = 500) => (typeof r[k] === "string" ? (r[k] as string).trim().slice(0, max) : "")
  const num = (k: string) => {
    const v = r[k]
    if (typeof v === "number") return v
    if (typeof v === "string" && v.trim() !== "") return Number(v)
    return 0
  }
  const list = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 300) : [])
  return {
    id: str("id", 64), status: str("status") || "UPCOMING", guestName: str("guestName", 200), contactNumber: str("contactNumber", 40),
    altContactNumber: str("altContactNumber", 40), email: str("email", 200), occupants: num("occupants"),
    emergencyContact: str("emergencyContact", 200), idType: str("idType"), idNumber: str("idNumber", 60), propertyId: str("propertyId", 64),
    unitId: str("unitId", 64), propertyType: str("propertyType"), checkIn: str("checkIn", 10), checkOut: str("checkOut", 10),
    inclusion: str("inclusion"), rateType: str("rateType") || "PER_MONTH", rate: num("rate"), totalAmount: num("totalAmount"),
    advancePaid: num("advancePaid"), paymentMode: str("paymentMode"), securityDeposit: num("securityDeposit"), depositMode: str("depositMode"),
    depositTerms: typeof r.depositTerms === "string" ? (r.depositTerms as string).trim().slice(0, 10000) : "",
    depositDeduction: num("depositDeduction"), deductionReason: str("deductionReason", 1000), depositRefundedOn: str("depositRefundedOn", 10),
    idDocuments: list("idDocuments"), checkInMedia: list("checkInMedia"), checkOutMedia: list("checkOutMedia"),
    notes: typeof r.notes === "string" ? (r.notes as string).trim().slice(0, 10000) : "",
  }
}

const EMAIL_RE =/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const BOOKING_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export function isValidBookingId(id: string): boolean {
  return BOOKING_ID_RE.test(id ?? "")
}

export function phoneDigits(value: string): number {
  return (value ?? "").replace(/\D/g, "").length
}

function isPhone(value: string): boolean {
  const n = phoneDigits(value)
  return n >= 8 && n <= 16 && /^[+\d\s()-]+$/.test(value.trim())
}

const oneOf = (list: readonly string[], v: string) => list.includes(v)
const values = <T extends { value: string }>(list: readonly T[]) => list.map((x) => x.value)

export function validateLongStay(input: LongStayInput): LongStayErrors {
  const e: LongStayErrors = {}
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "")

  if (!isValidBookingId(input.id)) e.id = "Invalid booking id"
  if (!s(input.guestName)) e.guestName = "Guest name is required"
  if (!s(input.contactNumber)) e.contactNumber = "Contact number is required"
  else if (!isPhone(input.contactNumber)) e.contactNumber = "Enter a phone number with 8–16 digits"
  if (s(input.altContactNumber) && !isPhone(input.altContactNumber)) e.altContactNumber = "Enter a phone number with 8–16 digits"
  if (s(input.email) && !EMAIL_RE.test(s(input.email))) e.email = "Enter a valid email"
  if (!Number.isInteger(input.occupants) || input.occupants < 1) e.occupants = "At least 1 guest"
  if (!s(input.idType)) e.idType = "ID type is required"
  else if (!oneOf(ID_TYPES, input.idType)) e.idType = "Pick an ID type from the list"
  if (!s(input.idNumber)) e.idNumber = "ID number is required"
  if (!s(input.propertyId)) e.propertyId = "Location is required"
  if (!s(input.propertyType)) e.propertyType = "Property type is required"
  else if (!oneOf(PROPERTY_TYPES, input.propertyType)) e.propertyType = "Pick a property type from the list"
  if (!oneOf(values(STATUSES), input.status)) e.status = "Pick a status"
  if (!s(input.inclusion)) e.inclusion = "Pick what's included"
  else if (!oneOf(values(INCLUSIONS), input.inclusion)) e.inclusion = "Pick what's included"
  if (!oneOf(values(RATE_TYPES), input.rateType)) e.rateType = "Pick a rate type"

  const ci = parseDateOnly(input.checkIn)
  const co = parseDateOnly(input.checkOut)
  if (!s(input.checkIn)) e.checkIn = "Check-in date is required"
  else if (ci === null) e.checkIn = "Enter a valid date"
  if (!s(input.checkOut)) e.checkOut = "Check-out date is required"
  else if (co === null) e.checkOut = "Enter a valid date"
  if (ci !== null && co !== null && co - ci < DAY_MS) e.checkOut = "Check-out must be at least 1 day after check-in"
  if (s(input.depositRefundedOn) && parseDateOnly(input.depositRefundedOn) === null) e.depositRefundedOn = "Enter a valid date"

  const money: (keyof LongStayInput)[] = ["rate", "totalAmount", "advancePaid", "securityDeposit", "depositDeduction"]
  for (const k of money) {
    const v = input[k] as number
    if (typeof v !== "number" || !Number.isFinite(v)) e[k] = "Enter a number"
    else if (v < 0) e[k] = "Can't be negative"
  }
  if (!e.depositDeduction && !e.securityDeposit && input.depositDeduction > input.securityDeposit) {
    e.depositDeduction = "Deduction can't be more than the deposit"
  }
  if (s(input.paymentMode) && !oneOf(PAYMENT_MODES, input.paymentMode)) e.paymentMode = "Pick a payment mode"
  if (s(input.depositMode) && !oneOf(PAYMENT_MODES, input.depositMode)) e.depositMode = "Pick a payment mode"
  return e
}

// ---------- file paths ----------

export function mediaPrefix(bookingId: string, kind: MediaKind): string {
  return `long-stay/${bookingId}/${kind}/`
}

export function agreementPrefix(bookingId: string): string {
  return `long-stay/${bookingId}/agreement/`
}

// Any stored Long Stays file: under long-stay/, no "..", no backslashes, nothing odd.
export function isLongStayPath(path: string): boolean {
  if (typeof path !== "string" || path.length > 512) return false
  if (!path.startsWith("long-stay/")) return false
  if (path.includes("..") || path.includes("\\") || path.includes("//")) return false
  return /^[\w\-./ ()]+$/.test(path)
}

// An uploaded booking file: long-stay/<bookingId>/<kind>/<file name>.
export function isBookingMediaPath(bookingId: string, kind: MediaKind, path: string): boolean {
  if (!isLongStayPath(path)) return false
  const prefix = mediaPrefix(bookingId, kind)
  return path.startsWith(prefix) && path.length > prefix.length && !path.slice(prefix.length).includes("/")
}

// Parses an upload pathname into its booking id and kind, or null if it isn't one.
export function parseUploadPath(path: string): { bookingId: string; kind: MediaKind } | null {
  if (!isLongStayPath(path)) return null
  const m = /^long-stay\/([A-Za-z0-9_-]{8,64})\/(id|checkin|checkout)\/[^/]+$/.exec(path)
  if (!m) return null
  return { bookingId: m[1], kind: m[2] as MediaKind }
}

export function mediaType(path: string): "image" | "video" | "pdf" | "file" {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  if (["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"].includes(ext)) return "image"
  if (["mp4", "mov", "webm", "m4v", "3gp", "qt"].includes(ext)) return "video"
  if (ext === "pdf") return "pdf"
  return "file"
}

export function mediaUrl(path: string, download = false): string {
  return "/api/long-stay/media?path=" + encodeURIComponent(path) + (download ? "&download=1" : "")
}
