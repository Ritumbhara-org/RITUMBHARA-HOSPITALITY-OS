import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { adminApiGuard, getAdminSession } from "@/lib/auth/guard"
import { runSeoAudit } from "@/lib/seo/audit"
import { SEO_ERROR_HTTP_STATUS, isSeoAuditError, type SeoErrorCode } from "@/lib/seo/errors"
import { acquireAuditSlot } from "@/lib/seo/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60 // crawl (<= ~28 s) + AI (<= 25 s), see lib/seo/audit.ts

const MAX_BODY_BYTES = 4096
const NO_STORE = { "Cache-Control": "no-store" }
const BodySchema = z.object({ url: z.string().min(1).max(2048) })

function fail(code: SeoErrorCode, error: string) {
  return NextResponse.json({ success: false, error, code }, { status: SEO_ERROR_HTTP_STATUS[code], headers: NO_STORE })
}

// POST /api/seo/audit { url } - crawl a website and return the SEO audit. Admin session required (also enforced by proxy.ts).
export async function POST(req: NextRequest) {
  const denied = await adminApiGuard()
  if (denied) return denied

  let body: z.infer<typeof BodySchema>
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return fail("invalid_url", "That request was too large.")
    const parsed = BodySchema.safeParse(JSON.parse(text))
    if (!parsed.success) return fail("invalid_url", "Please enter a website address to audit.")
    body = parsed.data
  } catch {
    return fail("invalid_url", "Please enter a website address to audit.")
  }

  const session = await getAdminSession()
  const slot = acquireAuditSlot(session?.u ?? "admin")
  if (!slot.ok) {
    return slot.code === "rate_limited"
      ? fail("rate_limited", "You've run several audits in a short time. Please wait a few minutes and try again.")
      : fail("busy", "Other audits are still running. Please try again in a moment.")
  }

  try {
    const result = await runSeoAudit(body.url)
    return NextResponse.json({ success: true, data: result }, { headers: NO_STORE })
  } catch (err) {
    if (isSeoAuditError(err)) return fail(err.code, err.message)
    // Unexpected: full detail goes to the server log only; the user gets a generic message.
    console.error("[seo-audit] unexpected failure:", err)
    return fail("internal", "The audit failed unexpectedly. Please try again.")
  } finally {
    slot.release()
  }
}
