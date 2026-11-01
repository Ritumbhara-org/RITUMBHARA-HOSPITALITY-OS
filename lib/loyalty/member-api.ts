// Shared helpers for the public member-portal API (/api/member/*). SERVER-ONLY.

import { NextResponse } from "next/server"
import { getMemberSession } from "./member-session"

export function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text()
    if (text.length > 4096) return {}
    const v = JSON.parse(text)
    return v && typeof v === "object" && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || request.headers.get("x-real-ip") || "unknown"
}

// Rejects cross-site form posts: the portal only calls its API from its own pages.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host || origin === process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
  } catch {
    return false
  }
}

export const requireMember = getMemberSession
