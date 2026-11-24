// Public: the guest's own signed PDF, only for a signed (not voided) agreement behind this link.
import { NextResponse } from "next/server"
import { get } from "@/lib/long-stay/blob"
import { findAgreementByToken } from "@/lib/long-stay/signing"

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const a = await findAgreementByToken(token)
  if (!a || a.status !== "SIGNED" || !a.pdfPath) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const file = await get(a.pdfPath, { access: "private" })
    if (!file || file.statusCode !== 200) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return new Response(file.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="ritumbhara-stay-agreement.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    console.error("[Long Stay] signed pdf read failed", err)
    return NextResponse.json({ error: "Couldn't load the file" }, { status: 502 })
  }
}
