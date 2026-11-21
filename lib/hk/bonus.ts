// Monthly bonus rule (pure, tested). Strict: the bonus is all or nothing.
//
// A housekeeper's month FAILS if any of these is true:
//   - a turnover was rejected by the admin (proof missing or not valid)
//   - any stay review for that month scored below 5 (stays with no review do not count against them)
// It is PENDING (not decided yet) while turnovers are still in progress or waiting for review.
// Otherwise it is ELIGIBLE. An admin decision (with a reason) overrides the computed result.
// Exempt turnovers (approved "guest already present") and approved ones count as fine.

export type TurnoverStatus = "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REJECTED" | "EXEMPT"

export type BonusInput = {
  turnoverStatuses: TurnoverStatus[]
  approvedExemptions: number
  ratings: number[]
  override?: { awarded: boolean; reason: string } | null
}

export type BonusResult = {
  computed: "ELIGIBLE" | "FAILED" | "PENDING"
  final: "AWARDED" | "NOT_AWARDED" | "PENDING"
  overridden: boolean
  reasons: string[]
  counts: { approved: number; rejected: number; waiting: number; exempt: number; lowRatings: number; ratings: number }
}

export function computeBonus(input: BonusInput): BonusResult {
  const c = { approved: 0, rejected: 0, waiting: 0, exempt: input.approvedExemptions, lowRatings: 0, ratings: input.ratings.length }
  for (const s of input.turnoverStatuses) {
    if (s === "APPROVED") c.approved++
    else if (s === "REJECTED") c.rejected++
    else if (s === "EXEMPT") c.exempt++
    else c.waiting++
  }
  c.lowRatings = input.ratings.filter((r) => r < 5).length

  const reasons: string[] = []
  if (c.rejected > 0) reasons.push(`${c.rejected} turnover(s) rejected`)
  if (c.lowRatings > 0) reasons.push(`${c.lowRatings} review(s) below 5 stars`)
  let computed: BonusResult["computed"]
  if (reasons.length > 0) computed = "FAILED"
  else if (c.waiting > 0) {
    computed = "PENDING"
    reasons.push(`${c.waiting} turnover(s) not reviewed yet`)
  } else computed = "ELIGIBLE"

  if (input.override) {
    return {
      computed,
      final: input.override.awarded ? "AWARDED" : "NOT_AWARDED",
      overridden: true,
      reasons: [...reasons, "Admin decision: " + input.override.reason],
      counts: c,
    }
  }
  return { computed, final: computed === "ELIGIBLE" ? "AWARDED" : computed === "FAILED" ? "NOT_AWARDED" : "PENDING", overridden: false, reasons, counts: c }
}

// "YYYY-MM"
export function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// [start, end) of a month in India time, as UTC Dates.
export function monthRangeIST(month: string): { start: Date; end: Date } {
  if (!isValidMonth(month)) throw new Error("Bad month")
  const [y, m] = month.split("-").map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS),
  }
}

export function monthOfIST(d: Date): string {
  const s = new Date(d.getTime() + IST_OFFSET_MS)
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}`
}
