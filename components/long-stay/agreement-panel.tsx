"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import { CheckCircle2, Copy, Download, Loader2, PenLine, Send, Smartphone, XCircle } from "lucide-react"
import { cancelLongStayAgreement, sendLongStayAgreement } from "@/app/actions/long-stay"
import { mediaUrl } from "@/lib/long-stay/shared"
import type { AgreementView } from "@/lib/long-stay/view"
import { AgreementBadgePill } from "./badges"
import { useTr } from "@/components/i18n/language-provider"

const when = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy, h:mm a") : "")

const btn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-50"

export function AgreementPanel({
  bookingId,
  agreement,
  dirty,
  materialChanged,
  contactNumber,
}: {
  bookingId: string
  agreement: AgreementView | null
  dirty: boolean
  materialChanged: boolean
  contactNumber: string
}) {
  const tr = useTr()
  const router = useRouter()
  const [busy, setBusy] = useState<"whatsapp" | "in_person" | "cancel" | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const badge = agreement?.badge ?? "NOT_SENT"
  const signed = badge === "SIGNED"

  async function send(mode: "whatsapp" | "in_person") {
    if (mode === "whatsapp" && agreement?.linkActive && !window.confirm("A signing link is already out. Send a new one? The old link will stop working.")) return
    setBusy(mode)
    const r = await sendLongStayAgreement(bookingId, mode)
    setBusy(null)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    if (mode === "in_person") {
      // Same tab: the booking is saved; staff hand the phone to the guest.
      window.location.assign(new URL(r.url).pathname)
      return
    }
    setLink(r.url)
    if (r.warning) toast.warning(r.warning)
    else toast.success(tr("Agreement sent on WhatsApp to {phone}", { phone: contactNumber }))
    router.refresh()
  }

  async function cancel() {
    if (!window.confirm("Cancel the signing link? The guest won't be able to sign with it.")) return
    setBusy("cancel")
    const r = await cancelLongStayAgreement(bookingId)
    setBusy(null)
    if (!r.success) toast.error(r.error || "Couldn't cancel the link")
    else {
      setLink(null)
      toast.success(tr("Signing link cancelled"))
      router.refresh()
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success(tr("Link copied"))
    } catch {
      window.prompt("Copy this link", link)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <AgreementBadgePill badge={badge} />
        {agreement && badge !== "SIGNED" && agreement.sentAt && (
          <span className="text-muted-foreground">
            Sent {when(agreement.sentAt)}{agreement.sentVia === "WHATSAPP" ? " on WhatsApp" : agreement.sentVia === "IN_PERSON" ? " in person" : ""}
            {agreement.viewedAt ? ` · viewed ${when(agreement.viewedAt)}` : ""}
            {agreement.linkActive && agreement.expiresAt ? ` · expires ${when(agreement.expiresAt)}` : ""}
            {!agreement.linkActive && badge !== "VOIDED" ? (agreement.locked ? " · locked after 5 wrong codes" : " · link expired") : ""}
          </span>
        )}
      </div>

      {badge === "VOIDED" && agreement?.voidReason && (
        <p className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-400"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> Voided: {agreement.voidReason}. Send a new one.</p>
      )}

      {signed && agreement && (
        <div className="rounded-xl border border-emerald-600/20 bg-emerald-50/60 p-4 dark:bg-emerald-500/5">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Signed by {agreement.signerName} on {when(agreement.signedAt)}
          </p>
          {materialChanged && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{tr("Your unsaved changes alter the agreement. Saving them voids this signature.")}</p>
          )}
          {agreement.pdfPath && (
            <a href={mediaUrl(agreement.pdfPath, true)} className={`${btn} mt-3 border bg-background hover:bg-muted`}>
              <Download className="h-4 w-4" /> {tr("Download signed PDF")}
            </a>
          )}
        </div>
      )}

      {!signed && (
        <>
          <p className="text-sm text-muted-foreground">
            {tr("The guest reviews the agreement, confirms a WhatsApp code and signs on their phone. The booking can't be checked in until it's signed.")}
          </p>
          {dirty && <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{tr("Save your changes first, so the guest signs the latest details.")}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={dirty || !!busy} onClick={() => send("whatsapp")} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
              {busy === "whatsapp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {agreement?.linkActive ? tr("Resend for e-sign") : tr("Send for e-sign")}
            </button>
            <button type="button" disabled={dirty || !!busy} onClick={() => send("in_person")} className={`${btn} border bg-background hover:bg-muted`}>
              {busy === "in_person" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              Sign now
            </button>
            {agreement?.linkActive && (
              <button type="button" disabled={!!busy} onClick={cancel} className={`${btn} text-destructive hover:bg-destructive/10`}>
                {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancel link
              </button>
            )}
          </div>
          {link && (
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><PenLine className="h-3.5 w-3.5" /> {tr("Signing link (valid 7 days)")}</p>
              <div className="flex gap-2">
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-xs" />
                <button type="button" onClick={copy} className={`${btn} border bg-background hover:bg-muted`}>
                  <Copy className="h-4 w-4" /> {tr("Copy link")}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{tr("For security only a fingerprint of this link is stored, so copy it now. You can always send a new one.")}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
