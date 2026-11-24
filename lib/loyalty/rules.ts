// Membership & Loyalty programme rules. Pure functions only (no database, no env), shared by server, admin UI,
// member portal and tests.

export const TIERS = ["STAR", "ROCKSTAR", "SUPERSTAR"] as const
export type Tier = (typeof TIERS)[number]
export type Channel = "DIRECT" | "OTA"

export const TIER_INFO: Record<Tier, { label: string; minSpend: number; multiplier: number; benefits: string[] }> = {
  STAR: {
    label: "Star",
    minSpend: 0,
    multiplier: 1,
    benefits: ["5 points per ₹100 on every stay", "Double points when you book direct", "100 points on your birthday and anniversary", "100 points for every friend you refer"],
  },
  ROCKSTAR: {
    label: "RockStar",
    minSpend: 12000,
    multiplier: 2,
    benefits: ["2X points on every stay", "4X points when you book direct", "Birthday, anniversary and referral bonuses"],
  },
  SUPERSTAR: {
    label: "Super Star",
    minSpend: 36000,
    multiplier: 4,
    benefits: ["4X points on every stay", "8X points when you book direct", "Birthday, anniversary and referral bonuses"],
  },
}

export const CHANNEL_MULTIPLIER: Record<Channel, number> = { OTA: 1, DIRECT: 2 }
export const BASE_POINTS_PER_100 = 5
export const POINT_VALUE_INR = 1
export const POINTS_VALIDITY_MONTHS = 6
export const QUALIFICATION_MONTHS = 6
export const EVENT_BONUS_POINTS = 100 // birthday, anniversary
export const REFERRAL_BONUS_POINTS = 100 // each side
export const EXPIRY_REMINDER_DAYS = 30

export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v)
}

export function tierRank(t: Tier): number {
  return TIERS.indexOf(t)
}

export function tierLabel(t: string | null | undefined): string {
  return isTier(t) ? TIER_INFO[t].label : "Star"
}

// ---------- channel ----------

const OTA_WORDS = ["airbnb", "booking", "makemytrip", "mmt", "goibibo", "agoda", "expedia", "trip.com", "tripadvisor", "hostelworld", "yatra", "cleartrip", "easemytrip", "ota", "channel manager", "vrbo", "hotels.com"]
const DIRECT_WORDS = ["walk", "direct", "website", "web", "whatsapp", "phone", "call", "telephone", "instagram", "email", "front desk", "reception", "os", "manual", "repeat", "referral", "corporate"]

// Direct = website, WhatsApp, phone, walk-in (and bookings the team makes in the OS). OTA = Airbnb, Booking.com,
// MakeMyTrip, Agoda and other portals. The PMS's own source name (sourceDetail) wins over the OS's coarse source.
// Anything unrecognised is treated as OTA, the lower-earning channel, so points are never over-awarded.
export function classifyChannel(source: string | null | undefined, sourceDetail?: string | null): Channel {
  const has = (s: string, w: string) => (w.length <= 3 ? new RegExp(`\\b${w}\\b`).test(s) : s.includes(w))
  for (const raw of [sourceDetail, source]) {
    const s = String(raw ?? "").trim().toLowerCase()
    if (!s) continue
    // Direct words first, so "Direct booking" isn't mistaken for Booking.com.
    if (DIRECT_WORDS.some((w) => has(s, w))) return "DIRECT"
    if (OTA_WORDS.some((w) => has(s, w))) return "OTA"
  }
  return "OTA"
}

// ---------- amounts and points ----------

export interface AmountInput {
  totalAmount: number
  taxAmount?: number | null
  refundedAmount?: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Eligible spend = booking total minus taxes minus refunds (never negative). Cancelled bookings earn nothing.
// Refundable security deposits are not part of the PMS booking total (they are tracked separately), so they never
// reach this figure.
export function eligibleAmount(r: AmountInput): number {
  const v = (Number(r.totalAmount) || 0) - Math.max(0, Number(r.taxAmount) || 0) - Math.max(0, Number(r.refundedAmount) || 0)
  return v > 0 ? round2(v) : 0
}

// Points = FLOOR((amount / 100) × 5 × channel multiplier × tier multiplier). Done in paise so floating point can't
// round a whole-rupee amount down by one.
export function calculatePoints(amount: number, channel: Channel, tier: Tier): number {
  if (!(amount > 0)) return 0
  const paise = Math.round(amount * 100)
  return Math.floor((paise * BASE_POINTS_PER_100 * CHANNEL_MULTIPLIER[channel] * TIER_INFO[tier].multiplier) / 10000)
}

export function earningMultiplier(channel: Channel, tier: Tier): number {
  return CHANNEL_MULTIPLIER[channel] * TIER_INFO[tier].multiplier
}

// ---------- tiers ----------

export function tierForSpend(spend: number): Tier {
  if (spend >= TIER_INFO.SUPERSTAR.minSpend) return "SUPERSTAR"
  if (spend >= TIER_INFO.ROCKSTAR.minSpend) return "ROCKSTAR"
  return "STAR"
}

export function effectiveTier(computed: Tier, override: string | null | undefined, overrideUntil: Date | null | undefined, now: Date): Tier {
  if (isTier(override) && (!overrideUntil || overrideUntil.getTime() > now.getTime())) return override
  return computed
}

export function nextTierProgress(spend: number, tier: Tier): { next: Tier | null; needed: number; percent: number } {
  const order = TIERS.slice(tierRank(tier) + 1)
  const next = order.find((t) => TIER_INFO[t].minSpend > spend) ?? null
  if (!next) return { next: null, needed: 0, percent: 100 }
  const from = TIER_INFO[tier].minSpend
  const to = TIER_INFO[next].minSpend
  const percent = Math.max(0, Math.min(100, Math.round(((spend - from) / Math.max(1, to - from)) * 100)))
  return { next, needed: round2(Math.max(0, to - spend)), percent }
}

// ---------- dates ----------

// Calendar-month arithmetic that clamps to the month's last day (31 Aug + 6 months = 28/29 Feb).
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime())
  const day = r.getUTCDate()
  r.setUTCDate(1)
  r.setUTCMonth(r.getUTCMonth() + months)
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(day, last))
  return r
}

export function pointsExpiry(creditedAt: Date): Date {
  return addMonths(creditedAt, POINTS_VALIDITY_MONTHS)
}

export function qualificationWindowStart(now: Date): Date {
  return addMonths(now, -QUALIFICATION_MONTHS)
}

// A stay counts toward tier qualification while its check-out lies inside (now − 6 months, now].
export function inQualificationWindow(checkOut: Date, now: Date): boolean {
  return checkOut.getTime() > qualificationWindowStart(now).getTime() && checkOut.getTime() <= now.getTime()
}

// Calendar date in India for a moment in time.
export function istDate(now: Date): { year: number; month: number; day: number; iso: string } {
  const ist = new Date(now.getTime() + 330 * 60 * 1000)
  const year = ist.getUTCFullYear()
  const month = ist.getUTCMonth() + 1
  const day = ist.getUTCDate()
  return { year, month, day, iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` }
}

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

// Does a stored birthday/anniversary (date-only) fall on today's IST date? 29 Feb is celebrated on 28 Feb in
// non-leap years.
export function isOccasionToday(date: Date, now: Date): boolean {
  const t = istDate(now)
  const m = date.getUTCMonth() + 1
  const d = date.getUTCDate()
  if (m === 2 && d === 29 && !isLeap(t.year)) return t.month === 2 && t.day === 28
  return m === t.month && d === t.day
}

// "YYYY-MM-DD" → Date at UTC midnight, or null when not a real calendar date (or in the future / before 1900).
export function parseDateOnly(v: unknown, now: Date = new Date()): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  if (d.getUTCFullYear() < 1900 || d.getTime() > now.getTime()) return null
  return d
}

export function toDateOnlyString(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

// ---------- ledger maths ----------

export interface CreditBatch {
  id: string
  amount: number
  allocated: number
  expiresAt: Date | null
  createdAt: Date
}

export interface DebitRow {
  id: string
  amount: number // negative
  allocated: number
  type: string
}

export function creditRemaining(c: CreditBatch): number {
  return Math.max(0, c.amount - c.allocated)
}

export function isCreditLive(c: CreditBatch, now: Date): boolean {
  return !c.expiresAt || c.expiresAt.getTime() > now.getTime()
}

// Plans which live credit batches a debit consumes: soonest-expiring first (then oldest). A preferred batch (the
// original booking credit, for a reversal) is consumed first. Returns the allocations and any shortfall.
export function planAllocation(credits: CreditBatch[], points: number, now: Date, preferCreditId?: string): { allocations: { creditId: string; points: number }[]; shortfall: number } {
  const live = credits
    .filter((c) => isCreditLive(c, now) && creditRemaining(c) > 0)
    .sort((a, b) => {
      if (a.id === preferCreditId) return -1
      if (b.id === preferCreditId) return 1
      const ea = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      const eb = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      return ea - eb || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
    })
  const allocations: { creditId: string; points: number }[] = []
  let left = points
  for (const c of live) {
    if (left <= 0) break
    const take = Math.min(left, creditRemaining(c))
    allocations.push({ creditId: c.id, points: take })
    left -= take
  }
  return { allocations, shortfall: Math.max(0, left) }
}

export interface PointsSummary {
  available: number
  lifetimeEarned: number
  redeemed: number
  expired: number
  reversed: number
  expiringSoon: number
  nextExpiry: { date: string; points: number } | null
  debt: number
}

const REDEEM_TYPES = new Set(["REDEMPTION"])
const EXPIRY_TYPES = new Set(["EXPIRY"])

export function summarizePoints(credits: CreditBatch[], debits: DebitRow[], now: Date): PointsSummary {
  const soon = now.getTime() + EXPIRY_REMINDER_DAYS * 86400000
  let live = 0
  let lapsedUnrecorded = 0
  let expiringSoon = 0
  let lifetimeEarned = 0
  let next: { t: number; points: number } | null = null
  for (const c of credits) {
    lifetimeEarned += c.amount
    const rem = creditRemaining(c)
    if (rem <= 0) continue
    if (isCreditLive(c, now)) {
      live += rem
      const t = c.expiresAt?.getTime()
      if (t !== undefined && t <= soon) expiringSoon += rem
      if (t !== undefined && (!next || t < next.t)) next = { t, points: rem }
      else if (t !== undefined && next && t === next.t) next.points += rem
    } else {
      lapsedUnrecorded += rem // expired, the expiry job just hasn't written its row yet
    }
  }
  let redeemed = 0
  let expired = 0
  let reversed = 0
  let debt = 0
  for (const d of debits) {
    const pts = -d.amount
    if (REDEEM_TYPES.has(d.type)) redeemed += pts
    else if (EXPIRY_TYPES.has(d.type)) expired += pts
    else reversed += pts
    debt += Math.max(0, pts - d.allocated)
  }
  return {
    available: live - debt,
    lifetimeEarned,
    redeemed,
    expired: expired + lapsedUnrecorded,
    reversed,
    expiringSoon,
    nextExpiry: next ? { date: new Date(next.t).toISOString(), points: next.points } : null,
    debt,
  }
}

// ---------- misc ----------

export function isValidMemberPhone(phone: string | null | undefined): phone is string {
  if (!phone || !/^\+[1-9]\d{9,14}$/.test(phone)) return false
  const national = phone.startsWith("+91") ? phone.slice(3) : phone.slice(1)
  return !/^0+$/.test(national) && !/^(\d)\1+$/.test(national)
}

export function maskMemberPhone(phone: string): string {
  return phone.length < 7 ? phone : phone.slice(0, 3) + " ••••• " + phone.slice(-4)
}

export function formatInr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN")
}

export function formatPoints(n: number): string {
  return Math.round(n).toLocaleString("en-IN")
}

const PAID_WORDS = /^(paid|completed|complete|settled|success|fully paid)$/i

// A stay counts as paid when the PMS says so, or when the amount paid covers the bill. Bookings made in the OS
// (no payment status) count as paid once checked out.
export function isReservationPaid(r: { paymentStatus?: string | null; paidAmount?: number | null; totalAmount: number }): boolean {
  if (r.paymentStatus && PAID_WORDS.test(r.paymentStatus.trim())) return true
  if (typeof r.paidAmount === "number" && r.totalAmount > 0 && r.paidAmount >= r.totalAmount - 0.5) return true
  return !r.paymentStatus && (r.paidAmount === null || r.paidAmount === undefined)
}

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  EARN_BOOKING: "Stay earned",
  BOOKING_ADJUSTMENT: "Stay adjusted",
  BOOKING_REVERSAL: "Stay reversed",
  BONUS_BIRTHDAY: "Birthday bonus",
  BONUS_ANNIVERSARY: "Anniversary bonus",
  BONUS_REFERRAL: "Referral bonus",
  ADJUSTMENT: "Manual adjustment",
  REDEMPTION: "Redeemed",
  EXPIRY: "Expired",
  LEGACY_OPENING_BALANCE: "Opening balance",
  JOIN_BONUS: "Welcome bonus",
  REFERRAL_BONUS: "Referral bonus",
}
