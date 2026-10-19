"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle, CalendarDays, CheckCheck, Clock, Copy, ExternalLink, Loader2, MessageCircle, MessageSquareText,
  PlugZap, RefreshCw, Send,
} from "lucide-react"
import { markGuestMessageSentAction } from "@/app/actions/guest-messages"
import { GUEST_MESSAGE_TYPE_LABELS, type GuestMessage, type GuestMessagesLoadResult } from "@/lib/guest-messages/types"
import {
  GUEST_MESSAGE_FILTER_LABELS, countGuestMessages, guestMessagePhase, matchesFilter, sortGuestMessages, whatsAppDraftLink,
  type GuestMessageFilter, type GuestMessagePhase,
} from "@/lib/guest-messages/view"

// Week 7 Guest Messages, shown on the Leads page as their own section (they are not leads). Read from the website's
// "Guest Messages" Sheet tab. The team sends each message by hand; nothing on this page sends a WhatsApp message.

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset"

const PHASE_BADGE: Record<GuestMessagePhase, { label: string; style: string }> = {
  send_now: { label: "READY · send today", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/25 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
  attention: { label: "Needs a check", style: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20" },
  upcoming: { label: "Upcoming", style: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20" },
  missed: { label: "Missed · do not send", style: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20" },
  done: { label: "Done", style: "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20" },
}

function typeLabel(type: string): string {
  return GUEST_MESSAGE_TYPE_LABELS[type] || type || "Message"
}

function SectionHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-primary" />Guest Messages</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {subtitle || "Pre-arrival, check-in and checkout messages for upcoming stays. Nothing is sent automatically: send each READY message yourself on WhatsApp, then mark it sent."}
      </p>
    </div>
  )
}

export function GuestMessagesSection({ data }: { data: GuestMessagesLoadResult }) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const refresh = () => startRefresh(() => router.refresh())

  if (!data.ok) {
    return (
      <section aria-label="Guest Messages" className="flex flex-col gap-3 pb-4">
        <SectionHeader />
        <div className="rounded-2xl border bg-card shadow-sm p-5 flex items-start gap-3 text-sm">
          {data.code === "not_configured" ? <PlugZap className="h-5 w-5 text-amber-600 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />}
          <div>
            {data.code === "not_configured" ? (
              <p className="text-muted-foreground">Guest messages are read from the same leads Google Sheet, which is not connected yet.</p>
            ) : (
              <>
                <p className="font-medium">Guest messages could not be loaded</p>
                <p className="text-muted-foreground mt-1">{data.message}</p>
                <button onClick={refresh} disabled={refreshing} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs font-semibold shadow-sm hover:bg-muted disabled:opacity-60">
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Try again
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    )
  }

  return <GuestMessagesList data={data} refresh={refresh} />
}

type SentPatch = { basis: string; statusUpdated: string }

function GuestMessagesList({ data, refresh }: { data: Extract<GuestMessagesLoadResult, { ok: true }>; refresh: () => void }) {
  const [filter, setFilter] = useState<GuestMessageFilter>("ACTION")
  // Saved "sent" marks, shown until the refreshed Sheet data includes them (fresh Sheet data always wins).
  const [patches, setPatches] = useState<Record<string, SentPatch>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const today = data.today

  const messages = useMemo(() => data.messages.map((m) => {
    const p = patches[m.id]
    return p && p.basis === m.statusText ? { ...m, status: "SENT" as const, statusText: "SENT", statusUpdated: p.statusUpdated || m.statusUpdated } : m
  }), [data.messages, patches])
  const counts = useMemo(() => countGuestMessages(messages, today), [messages, today])
  const shown = useMemo(() => sortGuestMessages(messages, today).filter((m) => matchesFilter(guestMessagePhase(m, today), filter)), [messages, today, filter])

  const filterCounts: Record<GuestMessageFilter, number> = {
    ACTION: counts.send_now + counts.attention,
    UPCOMING: counts.upcoming,
    DONE: counts.done + counts.missed,
    ALL: messages.length,
  }
  const sheetLink = (m: GuestMessage) => data.sheetUrl + (data.tabGid === null ? "" : "#gid=" + data.tabGid + "&range=A" + m.row)

  async function markSent(m: GuestMessage) {
    if (saving[m.id]) return
    setSaving((s) => ({ ...s, [m.id]: true }))
    const result = await markGuestMessageSentAction({ messageId: m.id })
    setSaving((s) => { const n = { ...s }; delete n[m.id]; return n })
    if (result.success) {
      const original = data.messages.find((x) => x.id === m.id)
      if (original) setPatches((p) => ({ ...p, [m.id]: { basis: original.statusText, statusUpdated: result.statusUpdated } }))
      toast.success(`${m.id} marked as sent`, { description: result.unchanged ? "It was already marked as sent." : "Saved to the Guest Messages Sheet." })
      refresh()
    } else if (result.code === "unauthorized") {
      window.location.assign("/login?next=" + encodeURIComponent("/leads"))
    } else {
      toast.error("Not marked as sent", { description: result.error })
      if (result.code === "conflict" || result.code === "not_found") refresh()
    }
  }

  return (
    <section aria-label="Guest Messages" className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader />
        <a href={data.sheetUrl + (data.tabGid === null ? "" : "#gid=" + data.tabGid)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          Open Guest Messages Sheet <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {data.tabMissing ? (
        <div className="rounded-2xl border bg-card shadow-sm px-6 py-10 text-center text-sm text-muted-foreground">
          <MessageSquareText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No &quot;Guest Messages&quot; tab in the leads Sheet yet. Guest messages appear here once the website starts queuing them.
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="p-3 border-b border-border/40 bg-muted/20 flex flex-wrap items-center gap-2" role="group" aria-label="Filter guest messages">
            {(Object.keys(GUEST_MESSAGE_FILTER_LABELS) as GuestMessageFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${filter === f ? "bg-primary text-primary-foreground shadow-sm" : "bg-background border border-border/60 hover:bg-muted"}`}
              >
                {GUEST_MESSAGE_FILTER_LABELS[f]} <span className={filter === f ? "opacity-80" : "text-muted-foreground"}>{filterCounts[f]}</span>
              </button>
            ))}
            {counts.send_now > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Send className="h-3.5 w-3.5" />{counts.send_now} to send today
              </span>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {messages.length === 0 ? "No guest messages yet." : filter === "ACTION" ? "Nothing to send right now." : "No guest messages in this view."}
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {shown.map((m) => (
                <GuestMessageItem
                  key={m.id}
                  m={m}
                  phase={guestMessagePhase(m, today)}
                  canMarkSent={data.canMarkSent}
                  saving={!!saving[m.id]}
                  sheetHref={sheetLink(m)}
                  onMarkSent={() => markSent(m)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5 break-words">{children}</dd>
    </div>
  )
}

function GuestMessageItem({ m, phase, canMarkSent, saving, sheetHref, onMarkSent }: {
  m: GuestMessage; phase: GuestMessagePhase; canMarkSent: boolean; saving: boolean; sheetHref: string; onMarkSent: () => void
}) {
  const badge = PHASE_BADGE[phase]
  const sendNow = phase === "send_now"
  const wa = whatsAppDraftLink(m.guestPhone, sendNow ? m.message : "")
  async function copy() {
    try {
      await navigator.clipboard.writeText(m.message)
      toast.success("Message copied")
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.")
    }
  }
  return (
    <li className={`p-4 sm:p-5 ${sendNow ? "bg-emerald-50/60 dark:bg-emerald-500/5 border-l-4 border-emerald-500" : ""}`} data-phase={phase}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${pill} ${badge.style}`}>{sendNow ? <Send className="h-3 w-3" /> : null}{badge.label}</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{typeLabel(m.type)}</span>
        <span className="font-mono text-[12px] font-semibold">{m.id}</span>
        <span className="text-[11px] text-muted-foreground">Status: {m.statusText || "—"}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Booking">{m.bookingCode || (m.bookingId ? "#" + m.bookingId : "—")}</Field>
        <Field label="Guest">{m.guest || "—"}</Field>
        <Field label="Guest WhatsApp">
          {m.guestPhone ? (
            wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400">{m.guestPhone}<MessageCircle className="h-3 w-3" /></a> : m.guestPhone
          ) : <span className="text-rose-600 dark:text-rose-400">Missing</span>}
        </Field>
        <Field label="Property">{m.property || "—"}</Field>
        <Field label="Stay"><span className="inline-flex items-center gap-1 whitespace-nowrap"><CalendarDays className="h-3 w-3 shrink-0" />{m.checkIn || "?"} → {m.checkOut || "?"}</span></Field>
        <Field label="Send window"><span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3 shrink-0" />{m.scheduledDate || "?"} → {m.sendBy || "?"}</span></Field>
      </dl>

      {phase === "missed" && (
        <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />The Send By date has passed. Do not send this message late.</p>
      )}
      {(phase === "attention" || m.reason) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {m.reason ? <>Reason: <span className="font-semibold text-foreground">{m.reason}</span></> : null}
          {m.status === null ? <> The Status cell holds &quot;{m.statusText || "nothing"}&quot;, which is not a guest message status. Check the row in the Sheet.</> : null}
          {m.status === "FAILED" ? <> This message could not be created as it should be. Check the booking in Intellistay; do not send it as it is.</> : null}
        </p>
      )}

      {m.message && (
        sendNow ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-background p-3 text-sm whitespace-pre-wrap break-words dark:border-emerald-500/20" aria-label={`Message to send for ${m.id}`}>{m.message}</div>
        ) : (
          <details className="mt-3 group">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Show message</summary>
            <div className="mt-2 rounded-xl border bg-muted/20 p-3 text-sm whitespace-pre-wrap break-words">{m.message}</div>
          </details>
        )
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sendNow && (
          <>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs font-semibold shadow-sm hover:bg-muted">
              <Copy className="h-3.5 w-3.5" /> Copy message
            </button>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-background px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10" title="Opens WhatsApp with the message typed in. You still press send.">
                <MessageCircle className="h-3.5 w-3.5" /> Open in WhatsApp
              </a>
            )}
            {canMarkSent ? (
              <button type="button" onClick={onMarkSent} disabled={saving} aria-label={`Mark ${m.id} as sent`} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}{saving ? "Saving…" : "Mark as sent"}
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">After sending, set Status to SENT in the Sheet.</span>
            )}
          </>
        )}
        {m.status === "SENT" && m.statusUpdated && <span className="text-[11px] text-muted-foreground">Sent · {m.statusUpdated}</span>}
        <a href={sheetHref} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
          Open row in Sheet <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </li>
  )
}
