import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

// Hashing for housekeeper PINs and the admin password.
// Format: scrypt$<salt hex>$<hash hex>

const KEY_LEN = 32

export function hashSecret(secret: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(secret, salt, KEY_LEN)
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [scheme, saltHex, hashHex] = stored.split("$")
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  if (expected.length !== KEY_LEN) return false
  const actual = scryptSync(secret, Buffer.from(saltHex, "hex"), KEY_LEN)
  return timingSafeEqual(actual, expected)
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}

// Lockout: 5 wrong PINs locks the account for 15 minutes.
export const MAX_FAILED_ATTEMPTS = 5
export const LOCK_MINUTES = 15

export function isLocked(lockedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime()
}

export function nextLockState(
  failedAttempts: number,
  now: Date = new Date()
): { failedAttempts: number; lockedUntil: Date | null } {
  const attempts = failedAttempts + 1
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) }
  }
  return { failedAttempts: attempts, lockedUntil: null }
}
