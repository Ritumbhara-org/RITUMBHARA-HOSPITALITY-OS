// First gate for every request (Next.js 16 "proxy", formerly middleware). Runs on the Node.js runtime.
//
// - Public paths (lib/auth/policy.ts) pass through.
// - Cron paths need "Authorization: Bearer <CRON_SECRET>" (fail closed if CRON_SECRET is not set).
// - /api/inbox/inbound-email passes through; the route checks its own INBOX_WEBHOOK_SECRET (fail closed).
// - Everything else needs a valid admin session cookie:
//     page requests (GET/HEAD)  -> redirect to /login?next=<path>
//     API requests              -> 401 JSON
//     any other request (e.g. a server action POST) -> 401
// - A signed-in admin who opens /login is sent to the dashboard.
// This is defence in depth: pages, server actions and API routes also check the session themselves.

import { NextResponse, type NextRequest } from "next/server"
import { isCronPath, isPublicPath, isSelfAuthenticatedMachinePath } from "@/lib/auth/policy"
import { checkCronAuth } from "@/lib/auth/cron"
import { isValidSession, safeNextPath, SESSION_COOKIE } from "@/lib/auth/session"

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Cron endpoints are machine-to-machine: only the cron secret opens them (an admin session does not), and a
  // missing CRON_SECRET keeps them closed. Each cron route checks again itself.
  if (isCronPath(pathname)) {
    const cron = checkCronAuth(request.headers.get("authorization"))
    if (cron.ok) return NextResponse.next()
    return NextResponse.json({ success: false, error: cron.error }, { status: cron.status, headers: { "Cache-Control": "no-store" } })
  }

  // Machine endpoints with their own secret (the inbox email webhook): the route checks INBOX_WEBHOOK_SECRET and
  // refuses everything when it is not set, so no admin session is required here.
  if (isSelfAuthenticatedMachinePath(pathname)) return NextResponse.next()

  const signedIn = isValidSession(request.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === "/login" && signedIn && (request.method === "GET" || request.method === "HEAD")) {
    return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url))
  }

  if (signedIn || isPublicPath(pathname)) return NextResponse.next()

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  const isNavigation = (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action")
  if (!isNavigation) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  const login = new URL("/login", request.url)
  if (pathname !== "/") login.searchParams.set("next", pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  // Every route except Next.js build assets and files with an extension (images, icons, fonts in /public).
  matcher: ["/((?!_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)"],
}
