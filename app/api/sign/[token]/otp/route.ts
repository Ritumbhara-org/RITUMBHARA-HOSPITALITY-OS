// Public: sends the WhatsApp OTP for one agreement. Limited per link (5 codes, 1 a minute).
import { NextResponse } from "next/server"
import { requestOtp } from "@/lib/long-stay/signing"

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await requestOtp(token)
  const headers = { "Cache-Control": "no-store" }
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, ...r.data }, { status: r.status, headers })
  return NextResponse.json({ ok: true, ...r.data }, { headers })
}
