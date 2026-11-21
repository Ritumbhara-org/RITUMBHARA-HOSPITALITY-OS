import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// Optimistic checks only. Real authorization happens in each page, server
// action and route handler (lib/hk/session.ts).
//
// - /hk/*        housekeeper app: needs an HK session
// - /hk-admin/*  module admin: needs an ADMIN session
// - A signed-in housekeeper is kept inside /hk and /api/hk. The rest of the
//   OS has no login yet, so this only holds while they stay signed in.

const hasSessionCookie = (req: NextRequest) =>
  req.cookies.has("next-auth.session-token") || req.cookies.has("__Secure-next-auth.session-token")

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const inHk = path === "/hk" || path.startsWith("/hk/")
  const inHkAdmin = path === "/hk-admin" || path.startsWith("/hk-admin/")
  const isApi = path.startsWith("/api/")

  // Fast path: no session cookie, nothing to enforce except the two gated areas.
  const token = hasSessionCookie(req)
    ? await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    : null

  if (token?.role === "HK") {
    const allowed = inHk || path.startsWith("/api/hk/") || path.startsWith("/api/auth/")
    if (!allowed) {
      return isApi
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/hk", req.url))
    }
  }

  if (inHkAdmin && path !== "/hk-admin/login" && token?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/hk-admin/login", req.url))
  }
  if (inHk && path !== "/hk/login" && token?.role !== "HK") {
    return NextResponse.redirect(new URL("/hk/login", req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.jpg|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
