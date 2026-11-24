"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  AlertTriangle, BellRing, CalendarDays, CheckCircle2, ExternalLink, Filter, Inbox, Loader2, MessageCircle,
  MoreHorizontal, PhoneCall, PlugZap, RefreshCw, Search, Sparkles, UserRound, XCircle,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { updateLeadStatusAction } from "@/app/actions/leads"
import { GuestMessagesSection } from "@/components/leads/guest-messages-section"
import type { GuestMessagesLoadResult } from "@/lib/guest-messages/types"
import { LEAD_STATUSES, LEAD_TABS, type Lead, type LeadStatus, type LeadsLoadResult } from "@/lib/leads/types"
import {
  SORT_LABELS, countLeads, guestDisplay, isFollowUpDue, visibleLeads,
  type KindFilter, type LeadSort, type StatusFilter,
} from "@/lib/leads/view"
import { useTr } from "@/components/i18n/language-provider"

// ---------- presentation helpers ----------

const STATUS_STYLES: Record<LeadStatus, string> = {
  New: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20",
  Contacted: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  Booked: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
  Lost: "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20",
}
const STATUS_DOT: Record<LeadStatus, string> = {
  New: "bg-blue-500", Contacted: "bg-amber-500", Booked: "bg-emerald-500", Lost: "bg-slate-400",
}
const PRIORITY_STYLES: Record<string, string> = {
  hot: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
  warm: "bg-orange-50 text-orange-700 ring-orange-600/15 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20",
  cold: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20",
}
const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: "All statuses", OPEN: "Open (New + Contacted)", DUE: "Follow-up due", New: "New", Contacted: "Contacted",
  Booked: "Booked", Lost: "Lost", OTHER: "Unrecognised status",
}
const KIND_LABELS: Record<KindFilter, string> = { ALL: "All lead types", qualified: "Qualified leads", handoff: "Handoffs" }

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset"

// All times are shown in India time, so the server render and the browser always agree.
const istDateTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const istDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })

function when(ms: number | null, fallback: string, withTime = true): string {
  if (ms === null) return fallback || "—"
  return (withTime ? istDateTime : istDate).format(new Date(ms))
}

function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 8 ? "https://wa.me/" + digits : null
}

function kindLabel(lead: Lead): string {
  return (LEAD_TABS.find((t) => t.kind === lead.kind) || { label: lead.kind }).label
}

function StatusBadge({ lead }: { lead: Lead }) {
  const tr = useTr()
  if (lead.status) {
    return <span className={`${pill} ${STATUS_STYLES[lead.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[lead.status]}`} />{lead.status}</span>
  }
  return (
    <span className={`${pill} bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-400`} title={tr("This value is not one of New, Contacted, Booked or Lost")}>
      <AlertTriangle className="h-3 w-3" />{lead.statusText || tr("No status")}
    </span>
  )
}

function PriorityBadge({ lead }: { lead: Lead }) {
  if (!lead.priority && lead.score === null) return <span className="text-xs text-muted-foreground">—</span>
  const style = PRIORITY_STYLES[lead.priority.toLowerCase()] || "bg-muted text-muted-foreground ring-border"
  return (
    <div className="flex flex-col items-start gap-1">
      {lead.priority && <span className={`${pill} ${style}`}>{lead.priority}</span>}
      {lead.score !== null && <span className="text-[10px] font-medium text-muted-foreground">Score {lead.score}</span>}
    </div>
  )
}

// ---------- page ----------

type Patch = { basis: string; status: LeadStatus; statusText: string; statusUpdated: string; nextFollowUp: string; nextFollowUpMs: number | null }

// guestMessages: the Week 7 Guest Messages section, shown below the leads (its own data; never mixed into leads).
export function LeadsClient({ data, guestMessages }: { data: LeadsLoadResult; guestMessages?: GuestMessagesLoadResult }) {
  const tr = useTr()
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const refresh = () => startRefresh(() => router.refresh())
  const guestSection = guestMessages ? <GuestMessagesSection data={guestMessages} /> : null

  if (!data.ok) {
    return (
      <>
      <div className="flex flex-col flex-1 w-full gap-5 pb-4">
        <PageHeader onRefresh={refresh} refreshing={refreshing} />
        <div className="rounded-2xl border bg-card shadow-sm p-8 sm:p-12 flex flex-col items-center text-center max-w-2xl mx-auto w-full">
          <div className={`rounded-2xl p-3 mb-4 ${data.code === "not_configured" ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"}`}>
            {data.code === "not_configured" ? <PlugZap className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          {data.code === "not_configured" ? (
            <>
              <h2 className="text-lg font-semibold">{tr("Leads are not connected yet")}</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {tr("This page reads the website's leads Google Sheet. An admin needs to add these server settings and share the Sheet with the service account (Editor):")}
              </p>
              <ul className="mt-4 flex flex-wrap justify-center gap-2">
                {data.missing.map((m) => <li key={m}><code className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">{m}</code></li>)}
              </ul>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{tr("Leads could not be loaded")}</h2>
              <p className="text-sm text-muted-foreground mt-2">{data.message}</p>
              <button onClick={refresh} disabled={refreshing} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> {tr("Try again")}
              </button>
            </>
          )}
        </div>
      </div>
      {guestSection}
      </>
    )
  }

  return (
    <>
      <LeadsBoard data={data} refresh={refresh} refreshing={refreshing} />
      {guestSection}
    </>
  )
}

function PageHeader({ onRefresh, refreshing, subtitle }: { onRefresh: () => void; refreshing: boolean; subtitle?: string }) {
  const tr = useTr()
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{tr("Leads")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle || tr("Every website and WhatsApp lead in one place. Update a status here and it is saved to the leads Sheet.")}</p>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm font-semibold shadow-sm transition-all hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? tr("Refreshing…") : tr("Refresh")}
      </button>
    </div>
  )
}

function LeadsBoard({ data, refresh, refreshing }: { data: Extract<LeadsLoadResult, { ok: true }>; refresh: () => void; refreshing: boolean }) {
  const tr = useTr()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL")
  const [sort, setSort] = useState<LeadSort>("newest")
  // Saved status changes, shown until the refreshed page data includes them. A patch only applies while the
  // Sheet data still shows the status it replaced, so fresh data from the Sheet always wins.
  const [patches, setPatches] = useState<Record<string, Patch>>({})
  const [saving, setSaving] = useState<Record<string, LeadStatus>>({})
  const nowMs = data.fetchedAt

  const leads = useMemo(() => data.leads.map((l) => {
    const p = patches[l.key]
    if (!p || p.basis !== l.statusText) return l
    return { ...l, status: p.status, statusText: p.statusText, statusUpdated: p.statusUpdated, nextFollowUp: p.nextFollowUp, nextFollowUpMs: p.nextFollowUpMs }
  }), [data.leads, patches])

  const counts = useMemo(() => countLeads(leads, nowMs), [leads, nowMs])
  const shown = useMemo(() => visibleLeads(leads, { query, status: statusFilter, kind: kindFilter, sort }, nowMs), [leads, query, statusFilter, kindFilter, sort, nowMs])
  const filtersActive = query.trim() !== "" || statusFilter !== "ALL" || kindFilter !== "ALL"

  const sheetLink = (lead: Lead) => {
    const gid = data.tabGids[lead.kind]
    return gid === undefined ? data.sheetUrl : data.sheetUrl + "#gid=" + gid + "&range=A" + lead.row
  }

  async function changeStatus(lead: Lead, status: LeadStatus, opts: { undo?: boolean } = {}) {
    if (saving[lead.key] || lead.status === status) return
    setSaving((s) => ({ ...s, [lead.key]: status }))
    const result = await updateLeadStatusAction({ kind: lead.kind, id: lead.id, status, expectedStatus: lead.statusText })
    setSaving((s) => { const n = { ...s }; delete n[lead.key]; return n })
    if (result.success) {
      const original = data.leads.find((l) => l.key === lead.key)
      if (original) {
        setPatches((p) => ({ ...p, [lead.key]: {
          basis: original.statusText, status: result.status, statusText: result.status,
          statusUpdated: result.statusUpdated, nextFollowUp: result.nextFollowUp, nextFollowUpMs: result.nextFollowUpMs,
        } }))
      }
      const previous = lead.status
      if (opts.undo) toast.success(`${lead.id} set back to ${status}`)
      else {
        toast.success(`${lead.id} marked ${status}`, {
          description: status === "Booked" || status === "Lost" ? tr("Follow-ups for this lead have stopped.") : result.nextFollowUp ? `Next follow-up: ${result.nextFollowUp} IST` : undefined,
          action: previous ? { label: "Undo", onClick: () => { void changeStatus({ ...lead, status, statusText: status }, previous, { undo: true }) } } : undefined,
        })
      }
      refresh()
    } else if (result.code === "unauthorized") {
      window.location.assign("/login?next=" + encodeURIComponent("/leads"))
    } else {
      toast.error(tr("Status not changed"), { description: result.error })
      if (result.code === "conflict" || result.code === "not_found") refresh()
    }
  }

  const tiles: { label: string; value: number; filter: StatusFilter; icon: typeof Inbox; color: string }[] = [
    { label: "Open leads", value: counts.open, filter: "OPEN", icon: Inbox, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
    { label: "Follow-up due", value: counts.due, filter: "DUE", icon: BellRing, color: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" },
    { label: "New", value: counts.New, filter: "New", icon: Sparkles, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
    { label: "Contacted", value: counts.Contacted, filter: "Contacted", icon: PhoneCall, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
    { label: "Booked", value: counts.Booked, filter: "Booked", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
    { label: "Lost", value: counts.Lost, filter: "Lost", icon: XCircle, color: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400" },
  ]

  const statusOptions: StatusFilter[] = ["ALL", "OPEN", "DUE", ...LEAD_STATUSES, ...(counts.other ? (["OTHER"] as StatusFilter[]) : [])]

  return (
    <div className="flex flex-col flex-1 w-full gap-5 pb-4">
      <PageHeader onRefresh={refresh} refreshing={refreshing} />

      {data.missingTabs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          Not found in the leads Sheet yet: {data.missingTabs.join(", ")}. Leads from that tab will appear here once it exists.
        </div>
      )}

      <div className="grid shrink-0 gap-2.5 sm:gap-4 grid-cols-3 lg:grid-cols-6">
        {tiles.map((t, i) => {
          const active = statusFilter === t.filter
          return (
            <motion.button
              key={tr(t.label)}
              type="button"
              onClick={() => setStatusFilter(active ? "ALL" : t.filter)}
              aria-pressed={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className={`group text-left rounded-2xl border bg-card min-w-0 p-3 sm:p-4 shadow-sm transition-all duration-300 hover:shadow-md ${active ? "border-primary/40 ring-2 ring-primary/15" : "hover:border-border/80"}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-3">
                <p className="text-xs sm:text-sm leading-snug font-medium text-muted-foreground">{tr(t.label)}</p>
                <div className={`hidden sm:block shrink-0 rounded-xl p-2 ${t.color} transition-transform duration-300 group-hover:scale-110`}><t.icon className="h-4 w-4" /></div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">{t.value}</h2>
            </motion.button>
          )
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="flex flex-col flex-1 min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-border/40 bg-muted/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder={tr("Search ID, phone, destination, property, notes…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={tr("Search leads")}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as StatusFilter) || "ALL")}>
              <SelectTrigger className="w-full lg:w-[200px] bg-background rounded-xl" aria-label={tr("Filter by status")}>
                <div className="flex items-center gap-2 truncate"><Filter className="h-4 w-4 shrink-0" /><span className="truncate">{tr(STATUS_FILTER_LABELS[statusFilter])}</span></div>
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((f) => <SelectItem key={f} value={f}>{tr(STATUS_FILTER_LABELS[f])}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter((v as KindFilter) || "ALL")}>
              <SelectTrigger className="w-full lg:w-[160px] bg-background rounded-xl" aria-label={tr("Filter by lead type")}>
                <span className="truncate">{tr(KIND_LABELS[kindFilter])}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as KindFilter[]).map((k) => <SelectItem key={k} value={k}>{tr(KIND_LABELS[k])}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort((v as LeadSort) || "newest")}>
              <SelectTrigger className="w-full lg:w-[190px] bg-background rounded-xl" aria-label={tr("Sort leads")}>
                <span className="truncate">{tr(SORT_LABELS[sort])}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as LeadSort[]).map((s) => <SelectItem key={s} value={s}>{tr(SORT_LABELS[s])}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-border/40 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>{tr("Showing {shown} of {total} leads", { shown: shown.length, total: counts.total })}</span>
          <span className="flex items-center gap-3">
            {filtersActive && (
              <button onClick={() => { setQuery(""); setStatusFilter("ALL"); setKindFilter("ALL") }} className="font-semibold text-primary hover:underline">{tr("Clear filters")}</button>
            )}
            <a href={data.sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:text-foreground">
              {tr("Open leads Sheet")} <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>

        {shown.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted-foreground flex flex-col items-center">
            <Inbox className="h-10 w-10 mb-3 opacity-30" />
            {counts.total === 0 ? (
              <>
                <p className="text-sm font-medium">{tr("No leads yet.")}</p>
                <p className="text-xs mt-1">{tr("New website and WhatsApp leads will appear here as soon as they reach the leads Sheet.")}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{tr("No leads match these filters.")}</p>
                <button onClick={() => { setQuery(""); setStatusFilter("ALL"); setKindFilter("ALL") }} className="mt-3 text-xs font-semibold text-primary hover:underline">{tr("Show all leads")}</button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Phones and small tablets: one card per lead */}
            <ul className="md:hidden divide-y divide-border/40">
              {shown.map((lead) => (
                <li key={lead.key} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <LeadIdCell lead={lead} />
                    </div>
                    <LeadActions lead={lead} sheetHref={sheetLink(lead)} />
                  </div>
                  <GuestCell lead={lead} />
                  <StayCell lead={lead} />
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge lead={lead} />
                    <FollowUpCell lead={lead} nowMs={nowMs} compact />
                  </div>
                  <StatusControl lead={lead} saving={saving[lead.key]} onChange={(s) => changeStatus(lead, s)} />
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block flex-1 overflow-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] uppercase bg-muted/30 text-muted-foreground sticky top-0 z-10 border-b border-border/40">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">{tr("Lead")}</th>
                    <th className="px-4 py-3.5 font-semibold">{tr("Guest")}</th>
                    <th className="px-4 py-3.5 font-semibold">{tr("Stay")}</th>
                    <th className="px-4 py-3.5 font-semibold">{tr("Source")}</th>
                    <th className="px-4 py-3.5 font-semibold">{tr("Priority")}</th>
                    <th className="px-4 py-3.5 font-semibold">{tr("Next follow-up")}</th>
                    <th className="px-4 py-3.5 font-semibold">{tr("Status")}</th>
                    <th className="px-4 py-3.5 font-semibold text-right"><span className="sr-only">{tr("Actions")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {shown.map((lead) => (
                    <tr key={lead.key} className="hover:bg-muted/30 transition-colors duration-150 align-top">
                      <td className="px-4 py-3.5"><LeadIdCell lead={lead} /></td>
                      <td className="px-4 py-3.5"><GuestCell lead={lead} /></td>
                      <td className="px-4 py-3.5 max-w-[260px]"><StayCell lead={lead} /></td>
                      <td className="px-4 py-3.5">
                        <div className="text-sm font-medium">{lead.source || "—"}</div>
                        {lead.ref && <div className="text-[11px] text-muted-foreground break-all">Ref: {lead.ref}</div>}
                        {lead.reason && <div className="text-[11px] text-muted-foreground">Reason: {lead.reason}</div>}
                      </td>
                      <td className="px-4 py-3.5"><PriorityBadge lead={lead} /></td>
                      <td className="px-4 py-3.5"><FollowUpCell lead={lead} nowMs={nowMs} /></td>
                      <td className="px-4 py-3.5 min-w-[170px]"><StatusControl lead={lead} saving={saving[lead.key]} onChange={(s) => changeStatus(lead, s)} /></td>
                      <td className="px-4 py-3.5 text-right"><LeadActions lead={lead} sheetHref={sheetLink(lead)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ---------- cells ----------

function LeadIdCell({ lead }: { lead: Lead }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-semibold font-mono text-[13px] whitespace-nowrap">{lead.id}</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{kindLabel(lead)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">Received {when(lead.receivedMs, lead.received)}</div>
    </div>
  )
}

function GuestCell({ lead }: { lead: Lead }) {
  const tr = useTr()
  const wa = whatsappLink(lead.phone)
  const shown = guestDisplay(lead)
  return (
    <div className="min-w-0">
      {shown.kind === "profile" ? (
        <Link href={`/guests/${shown.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">{shown.name}</Link>
      ) : shown.kind === "sheet" ? (
        <span className="font-semibold text-foreground">{shown.name}</span>
      ) : (
        <span className="text-xs text-muted-foreground italic">{tr("No guest profile")}</span>
      )}
      <div className="text-sm font-medium mt-0.5">
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400" title={tr("Open WhatsApp chat")}>
            {lead.phone}<MessageCircle className="h-3 w-3" />
          </a>
        ) : (lead.phone || "—")}
      </div>
    </div>
  )
}

function StayCell({ lead }: { lead: Lead }) {
  const place = [lead.destination, lead.property].filter(Boolean).join(" · ")
  const dates = lead.checkIn || lead.checkOut ? `${lead.checkIn || "?"} → ${lead.checkOut || "?"}` : ""
  const extra = [lead.nights ? `${lead.nights} night${lead.nights === "1" ? "" : "s"}` : "", lead.guests ? `${lead.guests} guest${lead.guests === "1" ? "" : "s"}` : ""].filter(Boolean).join(", ")
  const note = lead.requirements || lead.notes
  return (
    <div className="min-w-0">
      <div className="font-medium text-sm">{place || <span className="text-muted-foreground">—</span>}</div>
      {dates && <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 whitespace-nowrap"><CalendarDays className="h-3 w-3 shrink-0" />{dates}</div>}
      {extra && <div className="text-[11px] text-muted-foreground mt-0.5">{extra}</div>}
      {note && <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2" title={note}>{note}</div>}
    </div>
  )
}

function FollowUpCell({ lead, nowMs, compact }: { lead: Lead; nowMs: number; compact?: boolean }) {
  const tr = useTr()
  if (!lead.status || lead.status === "Booked" || lead.status === "Lost") {
    return compact ? null : <span className="text-xs text-muted-foreground">—</span>
  }
  if (!lead.nextFollowUp && lead.nextFollowUpMs === null) return compact ? null : <span className="text-xs text-muted-foreground">{tr("Not set")}</span>
  const due = isFollowUpDue(lead, nowMs)
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${due ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
      {due && <BellRing className="h-3 w-3" />}
      {compact && !due ? tr("Follow up ") : ""}{due ? tr("Due ") : ""}{when(lead.nextFollowUpMs, lead.nextFollowUp)}
    </span>
  )
}

function StatusControl({ lead, saving, onChange }: { lead: Lead; saving?: LeadStatus; onChange: (s: LeadStatus) => void }) {
  const tr = useTr()
  const value = saving || lead.status || ""
  return (
    <div className="flex flex-col gap-1">
      <Select value={value} onValueChange={(v) => { if (v && v !== lead.status) onChange(v as LeadStatus) }} disabled={!!saving}>
        <SelectTrigger className="w-full md:w-[150px] bg-background rounded-xl" aria-label={`Status for ${lead.id}`}>
          <span className="flex items-center gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : lead.status ? <span className={`h-2 w-2 rounded-full ${STATUS_DOT[lead.status]}`} /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
            <span className="truncate">{saving ? `Saving ${saving}…` : lead.status || tr("Set status")}</span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />{s}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!lead.status && <StatusBadge lead={lead} />}
    </div>
  )
}

function LeadActions({ lead, sheetHref }: { lead: Lead; sheetHref: string }) {
  const tr = useTr()
  const router = useRouter()
  const wa = whatsappLink(lead.phone)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground transition-colors" aria-label={`Actions for ${lead.id}`}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {wa && (
          <DropdownMenuItem onClick={() => window.open(wa, "_blank", "noopener,noreferrer")}>
            <MessageCircle className="h-4 w-4" /> {tr("Open WhatsApp chat")}
          </DropdownMenuItem>
        )}
        {lead.guest && (
          <DropdownMenuItem onClick={() => router.push(`/guests/${lead.guest!.id}`)}>
            <UserRound className="h-4 w-4" /> {tr("View guest profile")}
          </DropdownMenuItem>
        )}
        {lead.guest && (
          <DropdownMenuItem onClick={() => router.push(`/reservations?newBooking=true&guestId=${lead.guest!.id}`)}>
            <CalendarDays className="h-4 w-4" /> {tr("New reservation")}
          </DropdownMenuItem>
        )}
        {(wa || lead.guest) && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => window.open(sheetHref, "_blank", "noopener,noreferrer")}>
          <ExternalLink className="h-4 w-4" /> {tr("Open row in Sheet")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
