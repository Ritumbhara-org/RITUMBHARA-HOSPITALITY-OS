"use client"

import { useEffect, useRef, useState } from "react"
import SignaturePad from "signature_pad"
import { CheckCircle2, Download, Eraser, Loader2, ShieldCheck } from "lucide-react"
import { AGREEMENT_CONSENT } from "@/lib/long-stay/agreement"

type Section = { title: string; rows: [string, string][]; text?: string }

const btn = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-50"
const input = "h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"

async function post(url: string, body?: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })
    return (await res.json().catch(() => ({ ok: false, error: "Something went wrong. Please try again." }))) as { ok: boolean; error?: string }
  } catch {
    return { ok: false, error: "No connection. Please check your internet and try again." }
  }
}

export function SignClient({
  token, guestName, sections, maskedPhone, alreadySigned, signedName,
}: {
  token: string
  guestName: string
  sections: Section[]
  maskedPhone: string
  alreadySigned: boolean
  signedName: string | null
}) {
  const [readToEnd, setReadToEnd] = useState(false)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [otp, setOtp] = useState("")
  const [verified, setVerified] = useState(false)
  const [name, setName] = useState("")
  const [agree, setAgree] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [busy, setBusy] = useState<"otp" | "verify" | "sign" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [done, setDone] = useState(alreadySigned)
  const [cooldown, setCooldown] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const base = `/api/sign/${token}`

  useEffect(() => {
    const el = endRef.current
    if (!el || done) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setReadToEnd(true), { threshold: 1 })
    io.observe(el)
    return () => io.disconnect()
  }, [done])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Signature pad, sized for the screen's pixel density.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !verified || done) return
    const pad = new SignaturePad(canvas, { penColor: "#1f1f2e", minWidth: 0.8, maxWidth: 2.6 })
    padRef.current = pad
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const data = pad.toData()
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext("2d")?.scale(ratio, ratio)
      pad.clear()
      pad.fromData(data)
    }
    resize()
    const onEnd = () => setHasSignature(!pad.isEmpty())
    pad.addEventListener("endStroke", onEnd)
    window.addEventListener("resize", resize)
    return () => {
      window.removeEventListener("resize", resize)
      pad.removeEventListener("endStroke", onEnd)
      pad.off()
    }
  }, [verified, done])

  function handleError(r: { error?: string; state?: unknown; needOtp?: unknown }) {
    if (r.state) setFatal(r.error ?? "This link is no longer valid.")
    else if (r.needOtp) {
      setVerified(false)
      setError(r.error ?? "Please verify your phone again.")
    } else setError(r.error ?? "Something went wrong. Please try again.")
  }

  async function sendCode() {
    setBusy("otp")
    setError(null)
    const r = await post(`${base}/otp`)
    setBusy(null)
    if (!r.ok) {
      if (typeof r.retryAfter === "number") setCooldown(r.retryAfter)
      return handleError(r)
    }
    setCodeSentTo(String(r.sentTo ?? maskedPhone))
    setCooldown(60)
  }

  async function verify() {
    setBusy("verify")
    setError(null)
    const r = await post(`${base}/verify`, { otp })
    setBusy(null)
    if (!r.ok) return handleError(r)
    setVerified(true)
  }

  async function sign() {
    const pad = padRef.current
    if (!pad || pad.isEmpty()) return setError("Please draw your signature.")
    setBusy("sign")
    setError(null)
    const r = await post(`${base}/sign`, { name, signature: pad.toDataURL("image/png"), agree })
    setBusy(null)
    if (!r.ok) return handleError(r)
    setDone(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (fatal) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Link not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">{fatal}</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h1 className="mt-3 text-xl font-semibold">Agreement signed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {alreadySigned && signedName ? `Signed by ${signedName}. ` : "Thank you. "}
          A copy has been sent to you on WhatsApp.
        </p>
        <a href={`${base}/pdf`} className={`${btn} mt-5 bg-primary text-primary-foreground hover:bg-primary/90`}>
          <Download className="h-4 w-4" /> Download signed PDF
        </a>
      </div>
    )
  }

  const canSign = verified && name.trim().length >= 2 && agree && hasSignature

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Hi {guestName.split(" ")[0]}, please review your stay agreement</h1>
        <p className="mt-1 text-sm text-muted-foreground">Read to the end, confirm the code we send on WhatsApp, then sign.</p>
      </div>

      <article className="rounded-2xl border bg-card p-4 shadow-sm space-y-5">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 text-sm font-semibold text-[#5c0a20] dark:text-rose-300">{s.title}</h2>
            {s.rows.length > 0 && (
              <dl className="divide-y divide-border/50 rounded-xl border">
                {s.rows.map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-2 text-sm">
                    <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 flex-1 font-medium break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {s.text && <p className="whitespace-pre-line text-sm leading-relaxed">{s.text}</p>}
          </section>
        ))}
        <div ref={endRef} className="h-1" aria-hidden />
      </article>

      {!readToEnd ? (
        <p className="text-center text-sm text-muted-foreground">Scroll to the end of the agreement to continue.</p>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Step 1 · Verify your phone</h2>
            {verified ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Phone verified</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {codeSentTo ? `We sent a 6-digit code on WhatsApp to ${codeSentTo}.` : `We'll send a 6-digit code on WhatsApp to ${maskedPhone}.`}
                </p>
                {codeSentTo && (
                  <input
                    className={input + " tracking-[0.4em] text-center font-semibold"} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    placeholder="••••••" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="6-digit code"
                  />
                )}
                {codeSentTo ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={verify} disabled={otp.length !== 6 || !!busy} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
                      {busy === "verify" && <Loader2 className="h-4 w-4 animate-spin" />} Verify code
                    </button>
                    <button type="button" onClick={sendCode} disabled={cooldown > 0 || !!busy} className={`${btn} border bg-background hover:bg-muted`}>
                      {busy === "otp" && <Loader2 className="h-4 w-4 animate-spin" />} {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={sendCode} disabled={cooldown > 0 || !!busy} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
                    {busy === "otp" && <Loader2 className="h-4 w-4 animate-spin" />} {cooldown > 0 ? `Wait ${cooldown}s` : "Send code on WhatsApp"}
                  </button>
                )}
              </>
            )}
          </section>

          {verified && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold">Step 2 · Sign</h2>
              <div className="grid gap-1.5">
                <label htmlFor="signer-name" className="text-sm font-medium">Your full name</label>
                <input id="signer-name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Draw your signature</span>
                  <button type="button" onClick={() => { padRef.current?.clear(); setHasSignature(false) }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <Eraser className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>
                <canvas ref={canvasRef} className="h-44 w-full touch-none rounded-xl border-2 border-dashed bg-white" aria-label="Signature pad" />
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#5c0a20]" />
                <span>{AGREEMENT_CONSENT}</span>
              </label>
              <button type="button" onClick={sign} disabled={!canSign || !!busy} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
                {busy === "sign" && <Loader2 className="h-4 w-4 animate-spin" />} Sign agreement
              </button>
            </section>
          )}
        </>
      )}

      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    </div>
  )
}
