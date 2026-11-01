import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/utils/phone"
import { json, readJson, sameOrigin } from "@/lib/loyalty/member-api"
import { createMemberToken, MEMBER_COOKIE, memberCookieOptions } from "@/lib/loyalty/member-session"
import { applyReferral, ensureMembership } from "@/lib/loyalty/members"
import { LoyaltyError } from "@/lib/loyalty/ledger"
import { verifyOtp } from "@/lib/loyalty/otp"
import { isValidMemberPhone } from "@/lib/loyalty/rules"

// Member portal sign-in, step 2: check the code and start a session. A number that has stayed with us (or is new)
// becomes a Star member here; a referral code from the invite link is attached to new members only.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403)
  const body = await readJson(request)
  const phone = normalizePhoneNumber(typeof body.phone === "string" ? body.phone : "")
  if (!isValidMemberPhone(phone)) return json({ error: "Please enter a valid mobile number." }, 400)
  const v = await verifyOtp({ purpose: "LOGIN", phone, code: String(body.code ?? "") })
  if (!v.ok) return json({ error: v.error, attemptsLeft: v.attemptsLeft, locked: v.locked }, v.status)

  const existing = await prisma.membership.findUnique({ where: { phone } })
  let membership = existing
  if (!membership) {
    const guest = await prisma.guest.findFirst({ where: { phone }, orderBy: { createdAt: "asc" } })
    const name = typeof body.name === "string" ? body.name : guest?.name
    membership = await ensureMembership({ phone, name, guestId: guest?.id })
  }
  if (!membership) return json({ error: "Please enter a valid mobile number." }, 400)

  let warning: string | undefined
  if (!existing && typeof body.referralCode === "string" && body.referralCode.trim()) {
    try {
      await applyReferral(membership.id, body.referralCode, "MEMBER_PORTAL")
    } catch (e) {
      if (!(e instanceof LoyaltyError)) throw e
      warning = e.message
    }
  }
  const session = createMemberToken(membership.id, phone)
  if (!session) return json({ error: "Member sign-in isn't available right now." }, 503)
  const res = NextResponse.json({ success: true, isNew: !existing, warning }, { headers: { "Cache-Control": "no-store" } })
  res.cookies.set(MEMBER_COOKIE, session.token, memberCookieOptions(session.expiresAt))
  return res
}
