// Public signing page for one Long Stay agreement. Shows only the frozen agreement behind this link.
import type { Metadata } from "next"
import { agreementSections, type AgreementSnapshot } from "@/lib/long-stay/agreement"
import { findAgreementByToken, markViewed, signingState, STATE_MESSAGE } from "@/lib/long-stay/signing"
import { maskPhone } from "@/lib/long-stay/server"
import { SignClient } from "@/components/long-stay/sign-client"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Sign your stay agreement · Ritumbhara", robots: { index: false, follow: false } }

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const agreement = await findAgreementByToken(token)
  const state = signingState(agreement)

  if (!agreement || (state !== "ACTIVE" && state !== "SIGNED")) {
    return (
      <Shell>
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Link not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">{STATE_MESSAGE[state === "ACTIVE" || state === "SIGNED" ? "NOT_FOUND" : state]}</p>
        </div>
      </Shell>
    )
  }

  if (state === "ACTIVE") await markViewed(agreement)
  const snapshot = agreement.snapshot as unknown as AgreementSnapshot
  return (
    <Shell>
      <SignClient
        token={token}
        guestName={snapshot.guestName}
        sections={agreementSections(snapshot)}
        maskedPhone={maskPhone(agreement.booking.contactNumber)}
        alreadySigned={state === "SIGNED"}
        signedName={agreement.signerName}
      />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-muted/30">
      <header className="bg-gradient-to-r from-[#4a0518] via-[#5c0a20] to-[#3a0312] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Ritumbhara" className="h-8 w-auto" />
          <span className="text-sm font-semibold tracking-tight text-white/90">Stay agreement</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-5">{children}</main>
    </div>
  )
}
