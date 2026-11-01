// Which approved WhatsApp template each loyalty message uses. Pure (no database), so it can be unit-tested.

import type { LoyaltyMessageKind } from "./notify"

type Env = Record<string, string | undefined>

// The OS's already-approved one-time-code template (also used by Long Stay e-signing): "{{1}} is your code".
// Loyalty codes use it unless LOYALTY_WA_TEMPLATES names a dedicated one.
export const APPROVED_OTP_TEMPLATE_SID = "HX8c5e5c076a4376aaf54525c658bdf46b"
const SID = /^HX[0-9a-f]{32}$/i

export function twilioSidFor(kind: LoyaltyMessageKind, env: Env = process.env): string | undefined {
  let sid: unknown
  try {
    const map = JSON.parse(env.LOYALTY_WA_TEMPLATES || "{}")
    sid = map && typeof map === "object" ? map[kind] : undefined
  } catch {
    sid = undefined
  }
  if (typeof sid === "string" && SID.test(sid)) return sid
  if (kind === "OTP") {
    const shared = env.LONG_STAY_OTP_TEMPLATE_SID
    return shared && SID.test(shared) ? shared : APPROVED_OTP_TEMPLATE_SID
  }
  return undefined
}

// Meta: a dedicated "loyalty_otp" template only once it is configured in META_WA_TEMPLATES; otherwise the
// already-approved Long Stay OTP template.
export function metaOtpTemplateName(env: Env = process.env): string {
  return (env.META_WA_TEMPLATES || "").includes('"loyalty_otp"') ? "loyalty_otp" : "long_stay_otp"
}
