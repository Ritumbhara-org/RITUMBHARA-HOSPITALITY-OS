import { NextResponse } from "next/server"
import { MEMBER_COOKIE } from "@/lib/loyalty/member-session"

export async function POST() {
  const res = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } })
  res.cookies.set(MEMBER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: process.env.NODE_ENV === "production" })
  return res
}
