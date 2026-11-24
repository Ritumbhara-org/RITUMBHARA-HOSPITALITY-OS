// Channex takes rates in MINOR units (paise) on writes and returns decimal strings on reads. The OS uses rupees.
// Convert here and nowhere else, so two money conventions never leak through the codebase.

export function toMinor(major: number): number {
  return Math.round(major * 100)
}

export function fromMajorString(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}
