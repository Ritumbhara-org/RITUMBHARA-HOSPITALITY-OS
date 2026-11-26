"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/auth/rate-limit"
import { HK_COOKIE, createHkToken, hkCookieOptions } from "@/lib/hk/session"
import { isLocked, isValidPinFormat, nextLockState, verifySecret } from "@/lib/hk/secret"
import { normalizeMobile } from "@/lib/hk/validation"

export type HkLoginState = { error: string | null; mobile?: string }

async function clientKey(): Promise<string> {
  const h = await headers()
  const forwarded = (h.get("x-forwarded-for") || "").split(",")[0].trim()
  return "hk-ip:" + (forwarded || h.get("x-real-ip") || "unknown")
}

const BAD = "मोबाइल नंबर या पिन ग़लत है।"

// Housekeeper sign-in: mobile number + PIN set by the admin. Public by design (it is the login itself).
export async function hkLoginAction(_prev: HkLoginState, formData: FormData): Promise<HkLoginState> {
  const rawMobile = String(formData.get("mobile") || "").trim()
  const pin = String(formData.get("pin") || "")
  const mobile = normalizeMobile(rawMobile)

  const key = await clientKey()
  if (loginBlocked(key)) return { error: "बहुत ज़्यादा ग़लत कोशिशें। 15 मिनट रुककर दोबारा कोशिश करें।", mobile: rawMobile }

  const user = mobile && isValidPinFormat(pin) ? await prisma.hkUser.findUnique({ where: { mobile } }) : null

  if (user && isLocked(user.lockedUntil)) {
    return { error: "ग़लत पिन बहुत बार डालने से अकाउंट कुछ देर के लिए लॉक है। बाद में कोशिश करें।", mobile: rawMobile }
  }

  // Always run the hash check so timing does not reveal whether the number exists.
  const ok = verifySecret(pin, user?.pinHash ?? "scrypt$00$00") && !!user && user.isActive
  if (!ok || !user) {
    recordLoginFailure(key)
    if (user && user.isActive) {
      const s = nextLockState(user.failedAttempts)
      await prisma.hkUser.update({ where: { id: user.id }, data: { failedAttempts: s.failedAttempts, lockedUntil: s.lockedUntil } })
    }
    return { error: BAD, mobile: rawMobile }
  }

  const made = createHkToken(user)
  if (!made) {
    console.error("[hk-auth] no session secret configured (HK_SESSION_SECRET or ADMIN_SESSION_SECRET)")
    return { error: "साइन-इन अभी चालू नहीं है। कृपया एडमिन से संपर्क करें।", mobile: rawMobile }
  }

  clearLoginFailures(key)
  await prisma.hkUser.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } })
  const store = await cookies()
  store.set(HK_COOKIE, made.token, hkCookieOptions(made.expiresAt))
  redirect("/hk")
}

export async function hkLogoutAction(): Promise<void> {
  const store = await cookies()
  store.set(HK_COOKIE, "", { ...hkCookieOptions(new Date(0)), maxAge: 0 })
  redirect("/hk/login")
}
