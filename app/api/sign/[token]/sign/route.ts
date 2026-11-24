// Public: records the guest's signature for one agreement and produces the signed PDF.
import { NextResponse } from "next/server"
import { signAgreement } from "@/lib/long-stay/signing"
import { publicBaseUrl } from "@/lib/long-stay/server"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; signature?: unknown; agree?: unknown }
  const h = request.headers
  const r = await signAgreement(token, {
    name: typeof body.name === "string" ? body.name : "",
    signature: typeof body.signature === "string" ? body.signature : "",
    agree: body.agree === true,
    ip: (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "",
    userAgent: h.get("user-agent") || "",
    pdfBaseUrl: publicBaseUrl(h.get("x-forwarded-host") || h.get("host"), h.get("x-forwarded-proto")),
  })
  const headers = { "Cache-Control": "no-store" }
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, ...r.data }, { status: r.status, headers })
  return NextResponse.json({ ok: true, ...r.data }, { headers })
}
