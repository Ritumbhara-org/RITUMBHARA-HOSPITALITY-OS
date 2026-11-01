"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { ArrowLeft, CalendarHeart, Coins, Gift, KeyRound, Minus, Plus, ShieldCheck, Undo2 } from "lucide-react"
import { useTr } from "@/components/i18n/language-provider"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  adjustMemberPoints, applyMemberReferral, cancelPointsRedemption, confirmPointsRedemption, recordStayRefund, resendPointsRedemptionOtp,
  setMemberTier, startPointsRedemption, updateMemberDates,
} from "@/app/actions/loyalty"
import type { MemberDetail } from "@/lib/loyalty/queries"
import { formatInr, formatPoints, LEDGER_TYPE_LABEL, TIERS, TIER_INFO } from "@/lib/loyalty/rules"
import { TIER_CARD } from "./tier-badge"

const field = "h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
const primary = btn + " bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
const ghost = btn + " border border-border/60 bg-background hover:bg-muted"
const d = (s: string | null | undefined, f = "d MMM yyyy") => (s ? format(new Date(s), f) : "—")

type DialogKind = null | "redeem" | "adjust" | "tier" | "dates" | "referral" | { refund: MemberDetail["reservations"][number] }

export function MemberProfile({ member: m }: { member: MemberDetail }) {
  const tr = useTr()
  const router = useRouter()
  const [open, setOpen] = useState<DialogKind>(null)
  const [tab, setTab] = useState<"bookings" | "ledger" | "batches" | "redemptions" | "referrals" | "history">("bookings")
  const close = () => setOpen(null)
  const done = (msg: string) => {
    toast.success(msg)
    close()
    router.refresh()
  }
  const s = m.summary

  return (
    <div className="flex flex-col w-full gap-4 sm:gap-5 pb-6">
      <Link href="/loyalty" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit"><ArrowLeft className="h-4 w-4" /> {tr("All members")}</Link>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`lg:col-span-2 rounded-3xl bg-gradient-to-br ${TIER_CARD[m.tier]} p-5 sm:p-6 text-white shadow-lg`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">{TIER_INFO[m.tier].label} {tr("member")}</p>
              <h1 className="text-2xl font-bold mt-1">{m.name}</h1>
              <p className="text-sm text-white/70 mt-0.5">{m.membershipNumber} · {m.phone ?? tr("no mobile")}{m.email ? " · " + m.email : ""}</p>
              {m.tierOverride && <p className="mt-1 text-xs text-amber-200">{tr("Manual tier until")} {d(m.tierOverrideUntil)}</p>}
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold tabular-nums">{formatPoints(Math.max(0, s.available))}</p>
              <p className="text-sm text-white/70">{tr("points")} · {formatInr(Math.max(0, s.available))}</p>
              {s.debt > 0 && <p className="text-xs text-rose-200 mt-1">{tr("Owes")} {s.debt} {tr("points from a reversal")}</p>}
            </div>
          </div>
          <div className="mt-5">
            <div className="flex justify-between text-xs text-white/70">
              <span>{tr("6-month qualifying spend")}: {formatInr(m.qualifyingSpend)}</span>
              <span>{m.progress.next ? `${formatInr(m.progress.needed)} ${tr("to")} ${TIER_INFO[m.progress.next].label}` : tr("Top tier")}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-amber-200 to-amber-400" style={{ width: m.progress.percent + "%" }} /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className={btn + " bg-white text-[#5c0a20] hover:bg-white/90"} onClick={() => setOpen("redeem")} disabled={!m.phone || s.available <= 0}><KeyRound className="h-4 w-4" /> {tr("Redeem points")}</button>
            <button className={btn + " bg-white/10 hover:bg-white/20"} onClick={() => setOpen("adjust")}><Coins className="h-4 w-4" /> {tr("Adjust points")}</button>
            <button className={btn + " bg-white/10 hover:bg-white/20"} onClick={() => setOpen("tier")}><ShieldCheck className="h-4 w-4" /> {tr("Change tier")}</button>
            <button className={btn + " bg-white/10 hover:bg-white/20"} onClick={() => setOpen("dates")}><CalendarHeart className="h-4 w-4" /> {tr("Dates")}</button>
            {!m.referredBy && <button className={btn + " bg-white/10 hover:bg-white/20"} onClick={() => setOpen("referral")}><Gift className="h-4 w-4" /> {tr("Add referral code")}</button>}
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm grid grid-cols-2 gap-3 content-start">
          {[
            ["Lifetime earned", s.lifetimeEarned],
            ["Redeemed", s.redeemed],
            ["Expired", s.expired],
            ["Expiring in 30 days", s.expiringSoon],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-2xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{tr(l as string)}</p>
              <p className="text-lg font-bold tabular-nums">{formatPoints(v as number)}</p>
            </div>
          ))}
          <div className="col-span-2 text-sm space-y-1 pt-1">
            <p><span className="text-muted-foreground">{tr("Birthday")}:</span> {d(m.birthday, "d MMM")}</p>
            <p><span className="text-muted-foreground">{tr("Anniversary")}:</span> {d(m.anniversary, "d MMM")}</p>
            <p><span className="text-muted-foreground">{tr("Referral code")}:</span> <span className="font-mono font-semibold">{m.referralCode}</span></p>
            {m.referredBy && <p><span className="text-muted-foreground">{tr("Referred by")}:</span> {m.referredBy.name} ({m.referredBy.status.toLowerCase()})</p>}
            <p><span className="text-muted-foreground">{tr("Member since")}:</span> {d(m.joinedAt)}</p>
            {m.guestId && <Link href={`/guests/${m.guestId}`} className="text-primary text-xs font-semibold hover:underline">{tr("Guest profile")}</Link>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-border/60 p-2">
          {([["bookings", "Bookings"], ["ledger", "Points ledger"], ["batches", "Points by expiry"], ["redemptions", "Redemptions"], ["referrals", "Referrals"], ["history", "Tier & audit"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{tr(l)}</button>
          ))}
        </div>
        <div className="p-3 sm:p-4 overflow-x-auto">
          {tab === "bookings" && (
            <Table head={["Stay", "Status", "Channel", "Eligible", "Points", ""]} empty={tr("No bookings yet.")} rows={m.reservations.map((r) => [
              <div key="a"><div className="font-medium">{r.property} · {r.unit}</div><div className="text-xs text-muted-foreground">{d(r.checkIn)} – {d(r.checkOut)} · {r.source}</div></div>,
              r.status.replace("_", " ").toLowerCase(),
              r.channel === "DIRECT" ? tr("Direct") : "OTA",
              <div key="e" className="tabular-nums">{formatInr(r.eligibleAmount)}{r.refundedAmount > 0 && <div className="text-xs text-rose-600">{tr("refunded")} {formatInr(r.refundedAmount)}</div>}</div>,
              <span key="p" className={`font-semibold tabular-nums ${r.points < 0 ? "text-rose-600" : ""}`}>{r.points ? formatPoints(r.points) : "—"}</span>,
              r.status !== "CANCELLED" ? <button key="r" className="text-xs font-semibold text-primary hover:underline" onClick={() => setOpen({ refund: r })}><Undo2 className="inline h-3 w-3" /> {tr("Refund")}</button> : null,
            ])} />
          )}
          {tab === "ledger" && (
            <Table head={["Date", "Entry", "Details", "Points", "Expires"]} empty={tr("No points activity yet.")} rows={m.ledger.map((e) => [
              d(e.createdAt, "d MMM yyyy, HH:mm"),
              <div key="t"><div className="font-medium">{tr(LEDGER_TYPE_LABEL[e.type] ?? e.type)}</div><div className="text-xs text-muted-foreground">{e.description}</div></div>,
              <div key="x" className="text-xs text-muted-foreground">
                {e.channelMultiplier ? `${formatInr(e.eligibleAmount ?? 0)} · ${e.channel} ${e.channelMultiplier}× · ${TIER_INFO[(e.tier as "STAR") ?? "STAR"]?.label ?? e.tier} ${e.tierMultiplier}×` : ""}
                {e.reservationId ? <div>{tr("Booking")} {e.reservationId.slice(-8).toUpperCase()}</div> : null}
                {e.actor && e.actor !== "SYSTEM" ? <div>{tr("By")} {e.actor}{e.reason ? ` — ${e.reason}` : ""}</div> : null}
                <div className="font-mono text-[10px]">{e.id}</div>
              </div>,
              <span key="a" className={`font-semibold tabular-nums ${e.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}>{e.amount > 0 ? "+" : ""}{formatPoints(e.amount)}</span>,
              e.amount > 0 ? d(e.expiresAt) : "",
            ])} />
          )}
          {tab === "batches" && (
            <Table head={["Credited", "Remaining", "Expires"]} empty={tr("No live points.")} rows={m.batches.map((b) => [formatPoints(b.credited), <b key="r">{formatPoints(b.points)}</b>, d(b.expiresAt)])} />
          )}
          {tab === "redemptions" && (
            <Table head={["Reference", "Points", "Status", "By", "Date"]} empty={tr("No redemptions yet.")} rows={m.redemptions.map((r) => [
              <span key="r" className="font-mono">{r.reference}</span>, formatPoints(r.points), <span key="s" title={r.failureReason ?? ""}>{r.status.replace("_", " ").toLowerCase()}</span>, r.adminId, d(r.completedAt ?? r.createdAt, "d MMM yyyy, HH:mm"),
            ])} />
          )}
          {tab === "referrals" && (
            <Table head={["Referred member", "Status", "Joined", "Rewarded"]} empty={tr("No referrals yet.")} rows={m.referralsMade.map((r) => [`${r.name} (${r.membershipNumber ?? ""})`, r.status.toLowerCase(), d(r.createdAt), d(r.rewardedAt)])} />
          )}
          {tab === "history" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-semibold mb-2 text-sm">{tr("Tier history")}</h3>
                <Table head={["Date", "Change", "By"]} empty="—" rows={m.tierHistory.map((h) => [d(h.createdAt), `${h.fromTier ? TIER_INFO[h.fromTier as "STAR"]?.label ?? h.fromTier : "—"} → ${TIER_INFO[h.toTier as "STAR"]?.label ?? h.toTier} (${h.reason.toLowerCase().replace("_", " ")})${h.note ? " — " + h.note : ""}`, h.actor])} />
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-sm">{tr("Audit log")}</h3>
                <Table head={["Date", "Action", "By"]} empty="—" rows={m.audit.map((a) => [d(a.createdAt, "d MMM, HH:mm"), <div key="a"><div>{a.action.replaceAll("_", " ").toLowerCase()}</div><div className="text-[11px] text-muted-foreground break-all">{JSON.stringify(a.details)}</div></div>, a.actor])} />
                <h3 className="font-semibold mt-4 mb-2 text-sm">{tr("WhatsApp messages")}</h3>
                <Table head={["Date", "Message", "Status"]} empty="—" rows={m.notifications.map((n) => [d(n.createdAt, "d MMM, HH:mm"), n.kind.replaceAll("_", " ").toLowerCase(), <span key="s" title={n.lastError ?? ""} className={n.status === "FAILED" ? "text-rose-600" : ""}>{n.status.toLowerCase()}{n.attempts > 1 ? ` (${n.attempts})` : ""}</span>])} />
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          {open === "redeem" && <RedeemFlow m={m} onDone={done} />}
          {open === "adjust" && <AdjustForm id={m.id} onDone={done} />}
          {open === "tier" && <TierForm m={m} onDone={done} />}
          {open === "dates" && <DatesForm m={m} onDone={done} />}
          {open === "referral" && <ReferralForm id={m.id} onDone={done} />}
          {open && typeof open === "object" && <RefundForm r={open.refund} onDone={done} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  const tr = useTr()
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted-foreground border-b border-border/60">{head.map((h, i) => <th key={i} className="py-2 pr-3 font-medium">{h ? tr(h) : ""}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i} className="border-b border-border/40 last:border-0 align-top">{r.map((c, j) => <td key={j} className="py-2.5 pr-3">{c}</td>)}</tr>)}
        {rows.length === 0 && <tr><td colSpan={head.length} className="py-8 text-center text-muted-foreground">{empty}</td></tr>}
      </tbody>
    </table>
  )
}

function useAction() {
  const [pending, start] = useTransition()
  const run = <T extends object>(fn: () => Promise<({ success: true } & T) | { success: false; error: string }>, ok: (r: T) => void) =>
    start(async () => {
      const r = await fn()
      if (r.success) ok(r)
      else toast.error(r.error || "Something went wrong.")
    })
  return { pending, run }
}

function RedeemFlow({ m, onDone }: { m: MemberDetail; onDone: (msg: string) => void }) {
  const tr = useTr()
  const { pending, run } = useAction()
  const [points, setPoints] = useState("")
  const [reservationId, setReservationId] = useState("")
  const [note, setNote] = useState("")
  const [req, setReq] = useState<{ redemptionId: string; reference: string; sentTo: string } | null>(null)
  const [code, setCode] = useState("")
  const [result, setResult] = useState<{ reference: string; points: number; value: number; balance: number; transactionId: string } | null>(null)
  const pts = Number(points)
  const valid = Number.isInteger(pts) && pts > 0 && pts <= m.summary.available

  if (result) {
    return (
      <div className="space-y-3 text-center py-2">
        <DialogTitle>{tr("Redemption confirmed")}</DialogTitle>
        <p className="text-3xl font-bold">{formatPoints(result.points)} pts</p>
        <p className="text-sm text-muted-foreground">{tr("Discount value")} {formatInr(result.value)} · {tr("Reference")} <span className="font-mono font-semibold">{result.reference}</span></p>
        <p className="text-xs text-muted-foreground font-mono">{result.transactionId}</p>
        <p className="text-sm">{tr("Remaining balance")}: <b>{formatPoints(Math.max(0, result.balance))}</b></p>
        <button className={primary + " w-full"} onClick={() => onDone(tr("Points redeemed"))}>{tr("Done")}</button>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <DialogHeader>
        <DialogTitle>{tr("Redeem points")}</DialogTitle>
        <DialogDescription>{tr("1 point = ₹1. The member must share the code sent to their WhatsApp.")} {tr("Available")}: <b>{formatPoints(m.summary.available)}</b></DialogDescription>
      </DialogHeader>
      {!req ? (
        <>
          <input className={field} type="number" min={1} max={m.summary.available} placeholder={tr("Points to redeem")} value={points} onChange={(e) => setPoints(e.target.value)} />
          <select className={field} value={reservationId} onChange={(e) => setReservationId(e.target.value)}>
            <option value="">{tr("Against booking (optional)")}</option>
            {m.reservations.filter((r) => r.status !== "CANCELLED").slice(0, 20).map((r) => <option key={r.id} value={r.id}>{r.property} · {d(r.checkIn)}</option>)}
          </select>
          <input className={field} placeholder={tr("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={primary + " w-full"} disabled={!valid || pending} onClick={() => run(() => startPointsRedemption(m.id, pts, reservationId, note), (r) => setReq(r))}>
            {pending ? tr("Sending code…") : tr("Send OTP to member")}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">{tr("Code sent on WhatsApp to")} <b>{req.sentTo}</b> {tr("for")} <b>{formatPoints(pts)}</b> {tr("points")}. {tr("Valid for 5 minutes, 3 attempts.")}</p>
          <input className={field + " text-center text-lg tracking-[0.5em] font-mono"} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <button className={primary + " w-full"} disabled={code.length !== 6 || pending} onClick={() => run(() => confirmPointsRedemption(req.redemptionId, code), (r) => setResult(r))}>
            {pending ? tr("Verifying…") : tr("Verify & redeem")}
          </button>
          <div className="flex justify-between">
            <button className="text-sm text-primary font-semibold" disabled={pending} onClick={() => run(() => resendPointsRedemptionOtp(req.redemptionId), () => toast.success(tr("New code sent")))}>{tr("Resend code")}</button>
            <button className="text-sm text-muted-foreground" disabled={pending} onClick={() => run(() => cancelPointsRedemption(req.redemptionId), () => onDone(tr("Redemption cancelled")))}>{tr("Cancel request")}</button>
          </div>
        </>
      )}
    </div>
  )
}

function AdjustForm({ id, onDone }: { id: string; onDone: (msg: string) => void }) {
  const tr = useTr()
  const { pending, run } = useAction()
  const [sign, setSign] = useState<1 | -1>(1)
  const [points, setPoints] = useState("")
  const [reason, setReason] = useState("")
  const pts = Math.abs(Math.trunc(Number(points)))
  return (
    <div className="space-y-3">
      <DialogHeader><DialogTitle>{tr("Adjust points")}</DialogTitle><DialogDescription>{tr("Every adjustment is a new ledger entry with your name and reason.")}</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-2">
        <button className={sign === 1 ? primary : ghost} onClick={() => setSign(1)}><Plus className="h-4 w-4" /> {tr("Add")}</button>
        <button className={sign === -1 ? primary : ghost} onClick={() => setSign(-1)}><Minus className="h-4 w-4" /> {tr("Deduct")}</button>
      </div>
      <input className={field} type="number" min={1} placeholder={tr("Points")} value={points} onChange={(e) => setPoints(e.target.value)} />
      <textarea className={field + " h-20 py-2"} placeholder={tr("Reason (required)")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={primary + " w-full"} disabled={!pts || reason.trim().length < 3 || pending} onClick={() => run(() => adjustMemberPoints(id, sign * pts, reason), () => onDone(tr("Points updated")))}>{tr("Save adjustment")}</button>
    </div>
  )
}

function TierForm({ m, onDone }: { m: MemberDetail; onDone: (msg: string) => void }) {
  const tr = useTr()
  const { pending, run } = useAction()
  const [tier, setTier] = useState<string>(m.tierOverride ?? m.tier)
  const [until, setUntil] = useState("")
  const [reason, setReason] = useState("")
  return (
    <div className="space-y-3">
      <DialogHeader><DialogTitle>{tr("Change tier")}</DialogTitle><DialogDescription>{tr("A manual tier holds until the end date (default 6 months), then the rolling 6-month rule applies again.")}</DialogDescription></DialogHeader>
      <select className={field} value={tier} onChange={(e) => setTier(e.target.value)}>
        {TIERS.map((t) => <option key={t} value={t}>{TIER_INFO[t].label}</option>)}
        {m.tierOverride && <option value="">{tr("Remove manual tier (use rolling rule)")}</option>}
      </select>
      {tier && <label className="text-xs text-muted-foreground block">{tr("Holds until")}<input type="date" className={field + " mt-1"} value={until} onChange={(e) => setUntil(e.target.value)} /></label>}
      <textarea className={field + " h-20 py-2"} placeholder={tr("Reason (required)")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={primary + " w-full"} disabled={reason.trim().length < 3 || pending} onClick={() => run(() => setMemberTier(m.id, tier, until, reason), () => onDone(tr("Tier updated")))}>{tr("Save tier")}</button>
    </div>
  )
}

function DatesForm({ m, onDone }: { m: MemberDetail; onDone: (msg: string) => void }) {
  const tr = useTr()
  const { pending, run } = useAction()
  const [b, setB] = useState(m.birthday ?? "")
  const [a, setA] = useState(m.anniversary ?? "")
  return (
    <div className="space-y-3">
      <DialogHeader><DialogTitle>{tr("Birthday & anniversary")}</DialogTitle><DialogDescription>{tr("100 bonus points are credited on each date, once a year.")}</DialogDescription></DialogHeader>
      <label className="text-xs text-muted-foreground block">{tr("Birthday")}<input type="date" className={field + " mt-1"} value={b} onChange={(e) => setB(e.target.value)} /></label>
      <label className="text-xs text-muted-foreground block">{tr("Anniversary")}<input type="date" className={field + " mt-1"} value={a} onChange={(e) => setA(e.target.value)} /></label>
      <button className={primary + " w-full"} disabled={pending} onClick={() => run(() => updateMemberDates(m.id, b, a), () => onDone(tr("Dates saved")))}>{tr("Save")}</button>
    </div>
  )
}

function ReferralForm({ id, onDone }: { id: string; onDone: (msg: string) => void }) {
  const tr = useTr()
  const { pending, run } = useAction()
  const [code, setCode] = useState("")
  return (
    <div className="space-y-3">
      <DialogHeader><DialogTitle>{tr("Add referral code")}</DialogTitle><DialogDescription>{tr("Only for members without a completed stay. Both get 100 points after this member's first paid stay.")}</DialogDescription></DialogHeader>
      <input className={field + " uppercase font-mono"} placeholder="RBXXXXXX" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className={primary + " w-full"} disabled={!code.trim() || pending} onClick={() => run(() => applyMemberReferral(id, code), () => onDone(tr("Referral linked")))}>{tr("Apply")}</button>
    </div>
  )
}

function RefundForm({ r, onDone }: { r: MemberDetail["reservations"][number]; onDone: (msg: string) => void }) {
  const tr = useTr()
  const { pending, run } = useAction()
  const [amount, setAmount] = useState(String(r.refundedAmount || ""))
  const [reason, setReason] = useState("")
  return (
    <div className="space-y-3">
      <DialogHeader><DialogTitle>{tr("Record refund")}</DialogTitle><DialogDescription>{r.property} · {d(r.checkIn)} · {tr("total")} {formatInr(r.totalAmount)}. {tr("Enter the total refunded so far; points for this stay are recalculated.")}</DialogDescription></DialogHeader>
      <input className={field} type="number" min={0} max={r.totalAmount} placeholder={tr("Total refunded (₹)")} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <textarea className={field + " h-20 py-2"} placeholder={tr("Reason (required)")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={primary + " w-full"} disabled={amount === "" || reason.trim().length < 3 || pending} onClick={() => run(() => recordStayRefund(r.id, Number(amount), reason), (res) => onDone(res.points ? `${tr("Points changed by")} ${res.points}` : tr("Refund recorded")))}>{tr("Save refund")}</button>
    </div>
  )
}
