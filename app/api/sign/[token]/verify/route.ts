// Public: checks the WhatsApp OTP for one agreement. 5 wrong codes lock the link.
import { NextResponse } from "next/server"
import { verifyOtp } from "@/lib/long-stay/signing"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = (await request.json().catch(() => ({}))) as { otp?: unknown }
  const r = await verifyOtp(token, typeof body.otp === "string" ? body.otp : "")
  const headers = { "Cache-Control": "no-store" }
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, ...r.data }, { status: r.status, headers })
  return NextResponse.json({ ok: true }, { headers })
}
