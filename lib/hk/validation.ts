import { normalizePhoneNumber } from "@/lib/utils/phone"

// Indian mobile in E.164: +91 followed by 10 digits starting 6-9.
export function normalizeMobile(input: string | null | undefined): string | null {
  const e164 = normalizePhoneNumber(input)
  return /^\+91[6-9]\d{9}$/.test(e164) ? e164 : null
}
