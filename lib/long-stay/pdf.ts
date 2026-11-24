// Signed agreement PDF: the frozen agreement, the guest's signature and the audit trail on the last page.
// Built with pdf-lib's standard fonts, which only cover Windows-1252 text, so other characters are replaced.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { AGREEMENT_CONSENT, agreementSections, type AgreementSnapshot } from "./agreement"

export interface AuditTrail {
  signerName: string
  signedAtIst: string
  phoneVerified: string
  phoneVerifiedAtIst: string
  ip: string
  userAgent: string
  agreementHash: string
  agreementId: string
}

// Characters Windows-1252 has above 0x7F that Helvetica can draw.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""))

export function pdfSafe(text: string): string {
  return (text ?? "")
    .replace(/₹/g, "Rs.")
    .replace(/\t/g, "  ")
    .split("")
    .map((ch) => {
      const c = ch.charCodeAt(0)
      if (ch === "\n") return ch
      if (c >= 0x20 && c <= 0x7e) return ch
      if (c >= 0xa0 && c <= 0xff) return ch
      if (WIN_ANSI_EXTRA.has(ch)) return ch
      return "?"
    })
    .join("")
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of pdfSafe(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }
    let line = ""
    for (const word of words) {
      const next = line ? line + " " + word : word
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next
        continue
      }
      if (line) lines.push(line)
      // A single word wider than the line (a long URL, say) is cut into pieces.
      let w = word
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let cut = w.length - 1
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--
        lines.push(w.slice(0, cut))
        w = w.slice(cut)
      }
      line = w
    }
    if (line) lines.push(line)
  }
  return lines
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 50
const MAROON = rgb(0.36, 0.04, 0.13)
const GREY = rgb(0.4, 0.4, 0.4)

class Writer {
  page: PDFPage
  y: number
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage(A4)
    this.y = A4[1] - MARGIN
  }
  newPage() {
    this.page = this.doc.addPage(A4)
    this.y = A4[1] - MARGIN
  }
  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage()
  }
  text(t: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 10
    const font = opts.bold ? this.bold : this.font
    const x = opts.x ?? MARGIN
    const width = opts.width ?? A4[0] - MARGIN - x
    for (const line of wrapText(t, font, size, width)) {
      this.ensure(size + 4)
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? rgb(0.1, 0.1, 0.1) })
      this.y -= size + 4
    }
    this.y -= opts.gap ?? 0
  }
  row(label: string, value: string) {
    const size = 10
    const valueLines = wrapText(value, this.font, size, A4[0] - MARGIN * 2 - 140)
    this.ensure((size + 4) * Math.max(1, valueLines.length))
    this.page.drawText(pdfSafe(label), { x: MARGIN, y: this.y - size, size, font: this.bold, color: GREY })
    for (const line of valueLines) {
      this.page.drawText(line, { x: MARGIN + 140, y: this.y - size, size, font: this.font })
      this.y -= size + 4
    }
    if (!valueLines.length) this.y -= size + 4
  }
  rule() {
    this.ensure(10)
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 4 }, end: { x: A4[0] - MARGIN, y: this.y - 4 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
    this.y -= 12
  }
}

export async function buildSignedAgreementPdf(snapshot: AgreementSnapshot, signaturePng: Uint8Array, audit: AuditTrail): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(pdfSafe(`Long stay agreement - ${snapshot.guestName}`))
  doc.setAuthor("Ritumbhara Hospitality")
  doc.setCreationDate(new Date())
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(doc, font, bold)

  w.text("Ritumbhara Hospitality", { size: 11, bold: true, color: MAROON })
  w.text("Long Stay Agreement", { size: 18, bold: true, gap: 4 })
  w.text(`Booking ref ${snapshot.bookingId}`, { size: 9, color: GREY, gap: 6 })
  w.rule()

  for (const section of agreementSections(snapshot, "Rs.")) {
    w.text(section.title, { size: 12, bold: true, color: MAROON, gap: 2 })
    for (const [label, value] of section.rows) w.row(label, value)
    if (section.text) w.text(section.text, { size: 10 })
    w.y -= 8
  }

  w.rule()
  w.text(AGREEMENT_CONSENT + ".", { size: 10, gap: 6 })
  const sig = await doc.embedPng(signaturePng)
  const sigW = Math.min(220, sig.width)
  const sigH = (sig.height / sig.width) * sigW
  w.ensure(sigH + 40)
  w.page.drawImage(sig, { x: MARGIN, y: w.y - sigH, width: sigW, height: sigH })
  w.y -= sigH + 4
  w.text(`${audit.signerName} - signed ${audit.signedAtIst}`, { size: 10, bold: true })

  // Audit trail on its own last page.
  w.newPage()
  w.text("Signature audit trail", { size: 16, bold: true, color: MAROON, gap: 8 })
  w.row("Signer name", audit.signerName)
  w.row("Signed at", audit.signedAtIst)
  w.row("Phone verified", `${audit.phoneVerified} (OTP verified ${audit.phoneVerifiedAtIst})`)
  w.row("IP address", audit.ip || "unknown")
  w.row("Device", audit.userAgent || "unknown")
  w.row("Agreement ID", audit.agreementId)
  w.row("Agreement SHA-256", audit.agreementHash)
  w.y -= 10
  w.text(
    "The agreement content was frozen when the signing link was sent. The SHA-256 hash above is of that frozen content; " +
      "if any term changes, the hash changes and a new signature is required. Signed electronically with a WhatsApp OTP " +
      "sent to the guest's phone and a drawn signature.",
    { size: 9, color: GREY },
  )
  return doc.save()
}

export function istTimestamp(d: Date): string {
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    }).format(d) + " IST"
  )
}
