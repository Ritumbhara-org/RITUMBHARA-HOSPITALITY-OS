// Date helpers. Channex works in plain YYYY-MM-DD strings; the OS stores DateTime. Convert at the boundary only.

const DAY_MS = 86_400_000

export function isDateKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"))
}

export function addDays(dateKey: string, n: number): string {
  return new Date(Date.parse(dateKey + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10)
}

/** Calendar date of an instant in the given IANA time zone (a stay's check-in is a local date, not a UTC one). */
export function toDateKey(d: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

/** Nights of a stay: check-in inclusive, check-out exclusive. */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const out: string[] = []
  if (!isDateKey(checkIn) || !isDateKey(checkOut)) return out
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d)
  return out
}

export function eachDate(from: string, toInclusive: string): string[] {
  return eachNight(from, addDays(toInclusive, 1))
}
