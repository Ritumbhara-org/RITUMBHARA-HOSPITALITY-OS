"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { toast } from "sonner"
import { CalendarHeart, Copy, Crown, Gift, LogOut, Share2, Sparkles, Star } from "lucide-react"
import type { MemberPortalView } from "@/lib/loyalty/queries"
import {
  BASE_POINTS_PER_100, CHANNEL_MULTIPLIER, EVENT_BONUS_POINTS, formatInr, formatPoints, LEDGER_TYPE_LABEL, POINTS_VALIDITY_MONTHS,
  REFERRAL_BONUS_POINTS, TIERS, TIER_INFO,
} from "@/lib/loyalty/rules"
import { TIER_CARD } from "./tier-badge"

const input = "h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-base outline-none focus:border-[#5c0a20] focus:ring-4 focus:ring-[#5c0a20]/10"
const cta = "h-12 w-full rounded-2xl bg-[#5c0a20] font-semibold text-white shadow-lg shadow-[#5c0a20]/20 transition hover:bg-[#4a0819] disabled:opacity-60"
const d = (s: string | null | undefined, f = "d MMM yyyy") => (s ? format(new Date(s), f) : "—")

async function post(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f7f3ee] text-stone-900">
      <div className="mx-auto w-full max-w-md px-4 pb-12 pt-[calc(1.25rem+env(safe-area-inset-top))]">{children}</div>
    </main>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2 text-[#5c0a20]">
      <Crown className="h-5 w-5" />
      <span className="text-xs font-bold uppercase tracking-[0.3em]">Ritumbhara Rewards</span>
    </div>
  )
}

export function MemberLogin({ referralCode }: { referralCode: string }) {
  const router = useRouter()
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [sentTo, setSentTo] = useState("")
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const send = async () => {
    setBusy(true)
    const r = await post("/api/member/otp/request", { phone })
    setBusy(false)
    if (!r.ok) {
      if (r.data.retryAfter) setWait(r.data.retryAfter)
      return toast.error(r.data.error || "Couldn't send the code.")
    }
    setSentTo(r.data.sentTo)
    setStep("code")
    setWait(60)
  }
  const verify = async () => {
    setBusy(true)
    const r = await post("/api/member/otp/verify", { phone, code, name: name || undefined, referralCode: referralCode || undefined })
    setBusy(false)
    if (!r.ok) return toast.error(r.data.error || "That code didn't work.")
    if (r.data.warning) toast.error(r.data.warning)
    toast.success(r.data.isNew ? "Welcome to Ritumbhara Rewards!" : "Welcome back!")
    router.refresh()
  }

  return (
    <Shell>
      <Brand />
      <div className="mt-8 rounded-[2rem] bg-gradient-to-br from-[#7a1430] via-[#5c0a20] to-[#2a0410] p-6 text-white shadow-xl">
        <p className="text-sm text-white/70">Star · RockStar · Super Star</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">Every stay brings you closer to the next one.</h1>
        <p className="mt-3 text-sm text-white/75">Earn up to {BASE_POINTS_PER_100 * CHANNEL_MULTIPLIER.DIRECT * TIER_INFO.SUPERSTAR.multiplier} points per ₹100 when you book direct. 1 point = ₹1.</p>
      </div>

      <div className="mt-6 rounded-[2rem] bg-white p-5 shadow-sm">
        {referralCode && step === "phone" && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Invited by a friend — code <b>{referralCode}</b> will be applied when you join.</p>}
        {step === "phone" ? (
          <form onSubmit={(e) => { e.preventDefault(); send() }} className="space-y-3">
            <label className="text-sm font-medium">Mobile number</label>
            <input className={input} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className={cta} disabled={busy || phone.replace(/\D/g, "").length < 10 || wait > 0}>{busy ? "Sending…" : wait > 0 ? `Wait ${wait}s` : "Get code on WhatsApp"}</button>
            <p className="text-xs text-stone-500">Use the number you booked with. We&apos;ll send a 6-digit code on WhatsApp.</p>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); verify() }} className="space-y-3">
            <p className="text-sm">Enter the code sent to <b>{sentTo}</b>.</p>
            <input className={input + " text-center font-mono text-2xl tracking-[0.5em]"} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <input className={input} placeholder="Your name (if you're new)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <button className={cta} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Continue"}</button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-stone-500" onClick={() => { setStep("phone"); setCode("") }}>Change number</button>
              <button type="button" className="font-semibold text-[#5c0a20] disabled:opacity-50" disabled={wait > 0 || busy} onClick={send}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</button>
            </div>
          </form>
        )}
      </div>
    </Shell>
  )
}

export function MemberDashboard({ data: m, referralLink }: { data: MemberPortalView; referralLink: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<"stays" | "activity" | "benefits">("stays")
  const s = m.summary
  const TierIcon = m.tier === "SUPERSTAR" ? Crown : m.tier === "ROCKSTAR" ? Sparkles : Star
  const link = referralLink.startsWith("/") ? (typeof window !== "undefined" ? window.location.origin : "") + referralLink : referralLink

  const logout = async () => {
    await post("/api/member/logout", {})
    router.refresh()
  }
  const share = async () => {
    const text = `Join me at Ritumbhara Rewards — use my code ${m.referralCode} and we both get ${REFERRAL_BONUS_POINTS} points after your first stay. ${link}`
    if (navigator.share) await navigator.share({ text }).catch(() => {})
    else {
      await navigator.clipboard.writeText(text)
      toast.success("Invite copied")
    }
  }

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <Brand />
        <button onClick={logout} className="rounded-full p-2 text-stone-500 hover:bg-stone-200/60" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
      </div>

      <section className={`mt-5 rounded-[2rem] bg-gradient-to-br ${TIER_CARD[m.tier]} p-6 text-white shadow-xl`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-white/70">Hello, {m.name.split(" ")[0]}</p>
            <div className="mt-1 flex items-center gap-2"><TierIcon className="h-5 w-5 text-amber-300" /><span className="text-xl font-semibold">{TIER_INFO[m.tier].label}</span></div>
          </div>
          <p className="font-mono text-xs tracking-widest text-white/60">{m.membershipNumber}</p>
        </div>
        <div className="mt-6">
          <p className="text-5xl font-semibold tabular-nums">{formatPoints(Math.max(0, s.available))}</p>
          <p className="text-sm text-white/70">points available · worth {formatInr(Math.max(0, s.available))}</p>
        </div>
        <div className="mt-6">
          <div className="flex justify-between text-xs text-white/70">
            <span>{formatInr(m.qualifyingSpend)} in the last 6 months</span>
            <span>{m.progress.next ? `${formatInr(m.progress.needed)} to ${TIER_INFO[m.progress.next].label}` : "Top tier"}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-amber-200 to-amber-400" style={{ width: m.progress.percent + "%" }} /></div>
        </div>
      </section>

      {s.expiringSoon > 0 && (
        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{formatPoints(s.expiringSoon)} points</b> expire within 30 days{s.nextExpiry ? ` (first on ${d(s.nextExpiry.date)})` : ""}. Ask the front desk to use them on your next stay.
        </div>
      )}

      <section className="mt-4 grid grid-cols-3 gap-2">
        {[["Earned", s.lifetimeEarned], ["Redeemed", s.redeemed], ["Expired", s.expired]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl bg-white p-3 text-center shadow-sm">
            <p className="text-lg font-semibold tabular-nums">{formatPoints(v as number)}</p>
            <p className="text-[11px] uppercase tracking-wider text-stone-500">{l}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-[1.5rem] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-[#5c0a20]" /><h2 className="font-semibold">Refer a friend</h2></div>
        <p className="mt-1 text-sm text-stone-600">You both get {REFERRAL_BONUS_POINTS} points after their first completed stay.</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 rounded-xl bg-stone-100 px-3 py-2.5 font-mono text-base font-semibold tracking-wider">{m.referralCode}</span>
          <button className="rounded-xl bg-stone-100 p-3" aria-label="Copy code" onClick={() => { navigator.clipboard.writeText(m.referralCode); toast.success("Code copied") }}><Copy className="h-4 w-4" /></button>
          <button className="rounded-xl bg-[#5c0a20] p-3 text-white" aria-label="Share invite" onClick={share}><Share2 className="h-4 w-4" /></button>
        </div>
        {m.referralsMade.length > 0 && (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {m.referralsMade.map((r) => (
              <li key={r.id} className="flex justify-between py-2"><span>{r.name}</span><span className={r.status === "REWARDED" ? "text-emerald-700" : "text-stone-500"}>{r.status === "REWARDED" ? `+${REFERRAL_BONUS_POINTS} pts` : "Awaiting first stay"}</span></li>
            ))}
          </ul>
        )}
        {!m.referredBy && m.reservations.every((r) => r.status !== "CHECKED_OUT") && <ReferredByForm />}
        {m.referredBy && <p className="mt-3 text-xs text-stone-500">You joined through {m.referredBy.name}&apos;s invite.</p>}
      </section>

      <Occasions m={m} />

      <section className="mt-4 rounded-[1.5rem] bg-white shadow-sm">
        <div className="flex gap-1 border-b border-stone-100 p-2">
          {([["stays", "Stays"], ["activity", "Points activity"], ["benefits", "Benefits"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-xl py-2 text-sm font-medium ${tab === k ? "bg-[#5c0a20] text-white" : "text-stone-600"}`}>{l}</button>
          ))}
        </div>
        <div className="p-4">
          {tab === "stays" && (
            <ul className="divide-y divide-stone-100">
              {m.reservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.property}</p>
                    <p className="text-xs text-stone-500">{d(r.checkIn, "d MMM")} – {d(r.checkOut)} · {r.channel === "DIRECT" ? "Direct" : r.source}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${r.points < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {r.status === "CANCELLED" ? "Cancelled" : r.points ? `${r.points > 0 ? "+" : ""}${formatPoints(r.points)}` : r.status === "CHECKED_OUT" ? "—" : "After check-out"}
                  </span>
                </li>
              ))}
              {m.reservations.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Your stays will appear here.</p>}
            </ul>
          )}
          {tab === "activity" && (
            <ul className="divide-y divide-stone-100">
              {m.ledger.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{LEDGER_TYPE_LABEL[e.type] ?? e.type}</p>
                    <p className="text-xs text-stone-500">{e.description}</p>
                    <p className="text-[11px] text-stone-400">{d(e.createdAt)}{e.amount > 0 && e.expiresAt ? ` · valid till ${d(e.expiresAt)}` : ""}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${e.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{e.amount > 0 ? "+" : ""}{formatPoints(e.amount)}</span>
                </li>
              ))}
              {m.ledger.length === 0 && <p className="py-6 text-center text-sm text-stone-500">No points activity yet.</p>}
            </ul>
          )}
          {tab === "benefits" && (
            <div className="space-y-4 text-sm">
              {TIERS.map((t) => (
                <div key={t} className={`rounded-2xl p-4 ${t === m.tier ? "bg-[#5c0a20]/5 ring-1 ring-[#5c0a20]/20" : "bg-stone-50"}`}>
                  <div className="flex justify-between"><b>{TIER_INFO[t].label}</b><span className="text-stone-500">{TIER_INFO[t].minSpend ? `${formatInr(TIER_INFO[t].minSpend)} in 6 months` : "On joining"}</span></div>
                  <ul className="mt-2 list-disc pl-5 text-stone-600">{TIER_INFO[t].benefits.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              ))}
              <div className="rounded-2xl bg-stone-50 p-4 text-stone-600">
                <b className="text-stone-900">How points work</b>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>{BASE_POINTS_PER_100} points for every ₹100 spent (excluding taxes), multiplied by your tier.</li>
                  <li>Booking direct (website, WhatsApp, phone or walk-in) doubles your points.</li>
                  <li>Points are added after check-out and stay valid for {POINTS_VALIDITY_MONTHS} months.</li>
                  <li>{EVENT_BONUS_POINTS} bonus points on your birthday and anniversary.</li>
                  <li>1 point = ₹1. Redeem at the front desk with a WhatsApp code.</li>
                  <li>Your tier is based on stays completed in the last 6 months.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>
    </Shell>
  )
}

function ReferredByForm() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <form className="mt-3 flex gap-2" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      const r = await post("/api/member/referral", { code })
      setBusy(false)
      if (!r.ok) return toast.error(r.data.error || "That code didn't work.")
      toast.success("Referral code added")
      router.refresh()
    }}>
      <input className="h-11 flex-1 rounded-xl border border-stone-200 px-3 font-mono uppercase" placeholder="Friend's code" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !code.trim()}>Add</button>
    </form>
  )
}

function Occasions({ m }: { m: MemberPortalView }) {
  const router = useRouter()
  const [b, setB] = useState("")
  const [a, setA] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const r = await post("/api/member/profile", { birthday: b || undefined, anniversary: a || undefined, name: name || undefined }, "PATCH")
    setBusy(false)
    if (!r.ok) return toast.error(r.data.error || "Couldn't save.")
    toast.success("Saved")
    router.refresh()
  }
  const missing = !m.birthday || !m.anniversary || m.name === "Member"
  return (
    <section className="mt-4 rounded-[1.5rem] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><CalendarHeart className="h-4 w-4 text-[#5c0a20]" /><h2 className="font-semibold">Celebrations</h2></div>
      <p className="mt-1 text-sm text-stone-600">{EVENT_BONUS_POINTS} bonus points on each, every year.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-stone-500">Birthday</p><p className="font-medium">{m.birthday ? d(m.birthday, "d MMMM") : "Not added"}</p></div>
        <div><p className="text-stone-500">Anniversary</p><p className="font-medium">{m.anniversary ? d(m.anniversary, "d MMMM") : "Not added"}</p></div>
      </div>
      {missing && (
        <div className="mt-3 space-y-2">
          {m.name === "Member" && <input className="h-11 w-full rounded-xl border border-stone-200 px-3" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />}
          <div className="grid grid-cols-2 gap-2">
            {!m.birthday && <label className="text-xs text-stone-500">Birthday<input type="date" className="mt-1 h-11 w-full rounded-xl border border-stone-200 px-2" value={b} onChange={(e) => setB(e.target.value)} /></label>}
            {!m.anniversary && <label className="text-xs text-stone-500">Anniversary<input type="date" className="mt-1 h-11 w-full rounded-xl border border-stone-200 px-2" value={a} onChange={(e) => setA(e.target.value)} /></label>}
          </div>
          <button className="h-11 w-full rounded-xl bg-stone-900 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || (!b && !a && !name)} onClick={save}>Save</button>
          <p className="text-[11px] text-stone-400">Dates can be added once. To change them later, ask our team.</p>
        </div>
      )}
    </section>
  )
}
