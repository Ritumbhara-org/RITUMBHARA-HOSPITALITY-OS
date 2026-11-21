const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// Midnight at the start of the current day in India, as a UTC Date.
export function startOfDayIST(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - IST_OFFSET_MS)
}
