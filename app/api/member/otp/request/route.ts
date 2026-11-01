import { normalizePhoneNumber } from "@/lib/utils/phone"
import { clientIp, json, readJson, sameOrigin } from "@/lib/loyalty/member-api"
import { memberSessionConfigured } from "@/lib/loyalty/member-session"
import { sendOtpMessage } from "@/lib/loyalty/notify"
import { issueOtp, OTP_TTL_MS } from "@/lib/loyalty/otp"
import { isValidMemberPhone, maskMemberPhone } from "@/lib/loyalty/rules"

// Member portal sign-in, step 1: send a 6-digit code to the mobile number on WhatsApp. The response is the same
// whether or not the number is already a member (no account enumeration). Rate-limited per number and per IP.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403)
  if (!memberSessionConfigured()) return json({ error: "Member sign-in isn't available right now." }, 503)
  const body = await readJson(request)
  const phone = normalizePhoneNumber(typeof body.phone === "string" ? body.phone : "")
  if (!isValidMemberPhone(phone)) return json({ error: "Please enter a valid mobile number." }, 400)
  const otp = await issueOtp({ purpose: "LOGIN", phone, ip: clientIp(request) })
  if (!otp.ok) return json({ error: otp.error, retryAfter: otp.retryAfter }, otp.status)
  const sent = await sendOtpMessage(phone, otp.code, "LOGIN")
  if (!sent.ok) return json({ error: "We couldn't send the code on WhatsApp. Please try again in a minute." }, 502)
  return json({ sent: true, sentTo: maskMemberPhone(phone), expiresInSeconds: OTP_TTL_MS / 1000 })
}
