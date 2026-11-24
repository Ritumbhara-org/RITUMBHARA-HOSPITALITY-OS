// Slows down password guessing on the login form. SERVER-ONLY, in-memory (per server instance).
// After MAX_FAILURES failed attempts from one IP within WINDOW_MS, further attempts from that IP are refused
// until the window passes. A successful login clears the counter. On serverless hosting each instance keeps its
// own counter, so this is a speed bump on top of a strong password, not a guarantee.

const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000
const MAX_TRACKED = 5000

const failures = new Map<string, { count: number; firstAt: number }>()

export function loginBlocked(key: string, nowMs: number = Date.now()): boolean {
  const entry = failures.get(key)
  if (!entry) return false
  if (nowMs - entry.firstAt > WINDOW_MS) {
    failures.delete(key)
    return false
  }
  return entry.count >= MAX_FAILURES
}

export function recordLoginFailure(key: string, nowMs: number = Date.now()) {
  const entry = failures.get(key)
  if (!entry || nowMs - entry.firstAt > WINDOW_MS) {
    if (failures.size >= MAX_TRACKED) failures.delete(failures.keys().next().value as string)
    failures.set(key, { count: 1, firstAt: nowMs })
  } else {
    entry.count++
  }
}

export function clearLoginFailures(key: string) {
  failures.delete(key)
}

export function resetLoginRateLimit() {
  failures.clear()
}
