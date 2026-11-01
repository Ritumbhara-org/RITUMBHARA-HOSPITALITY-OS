"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { format } from "date-fns"
import { CalendarClock, Crown, Download, Search, Users, Wallet } from "lucide-react"
import { useTr } from "@/components/i18n/language-provider"
import type { MemberFilters, MemberRow } from "@/lib/loyalty/queries"
import { formatInr, formatPoints, TIERS, TIER_INFO } from "@/lib/loyalty/rules"
import { TierBadge } from "./tier-badge"

interface Overview {
  counts: Record<string, number>
  totalMembers: number
  outstandingPoints: number
  expiring: { membershipId: string; name: string; membershipNumber: string | null; expiresAt: string; points: number }[]
}

const field = "h-10 rounded-xl border border-border/60 bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"

export function LoyaltyList({ rows, total, page, pageSize, filters, overview, locations }: {
  rows: MemberRow[]; total: number; page: number; pageSize: number; filters: MemberFilters; overview: Overview; locations: { id: string; name: string }[]
}) {
  const tr = useTr()
  const router = useRouter()
  const [f, setF] = useState<MemberFilters>(filters)
  const qs = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, String(v))
    return p.toString()
  }
  const apply = (e?: React.FormEvent) => {
    e?.preventDefault()
    router.push("/loyalty?" + qs())
  }
  const set = (k: keyof MemberFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const expiringTotal = overview.expiring.reduce((s, e) => s + e.points, 0)
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const cards = [
    { label: "Members", value: formatPoints(overview.totalMembers), icon: Users, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { label: "Points outstanding", value: formatPoints(overview.outstandingPoints), sub: formatInr(overview.outstandingPoints) + " " + tr("liability"), icon: Wallet, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { label: "Expiring in 30 days", value: formatPoints(expiringTotal), icon: CalendarClock, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { label: "RockStar + Super Star", value: formatPoints((overview.counts.ROCKSTAR ?? 0) + (overview.counts.SUPERSTAR ?? 0)), icon: Crown, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  ]

  return (
    <div className="flex flex-col flex-1 w-full gap-4 sm:gap-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{tr("Membership & Loyalty")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tr("Star, RockStar and Super Star members, points and redemptions.")}</p>
        </div>
        <div className="flex gap-2">
          <a href={"/api/loyalty/export?report=members&" + qs()} className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-semibold shadow-sm hover:bg-muted">
            <Download className="h-4 w-4" /> {tr("Members CSV")}
          </a>
          <a href={"/api/loyalty/export?report=ledger&" + qs()} className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-semibold shadow-sm hover:bg-muted">
            <Download className="h-4 w-4" /> {tr("Ledger CSV")}
          </a>
        </div>
      </div>

      <div className="grid gap-2.5 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{tr(c.label)}</p>
              <span className={`rounded-lg p-1.5 ${c.color}`}><c.icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-bold">{c.value}</p>
            {c.sub && <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <form onSubmit={apply} className="grid gap-2 grid-cols-2 sm:grid-cols-4">
            <div className="relative col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className={field + " w-full pl-9"} placeholder={tr("Name, mobile or membership ID")} value={f.q ?? ""} onChange={set("q")} />
            </div>
            <select className={field} value={f.tier ?? ""} onChange={set("tier")} aria-label={tr("Tier")}>
              <option value="">{tr("All tiers")}</option>
              {TIERS.map((t) => <option key={t} value={t}>{TIER_INFO[t].label}</option>)}
            </select>
            <select className={field} value={f.propertyId ?? ""} onChange={set("propertyId")} aria-label={tr("Location")}>
              <option value="">{tr("All locations")}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">{tr("Joined from")}<input type="date" className={field} value={f.joinedFrom ?? ""} onChange={set("joinedFrom")} /></label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">{tr("Joined to")}<input type="date" className={field} value={f.joinedTo ?? ""} onChange={set("joinedTo")} /></label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">{tr("Min points")}<input type="number" className={field} value={f.minPoints ?? ""} onChange={set("minPoints")} /></label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">{tr("Max points")}<input type="number" className={field} value={f.maxPoints ?? ""} onChange={set("maxPoints")} /></label>
            <div className="col-span-2 sm:col-span-4 flex gap-2 justify-end">
              <button type="button" onClick={() => { setF({}); router.push("/loyalty") }} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">{tr("Clear")}</button>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">{tr("Apply filters")}</button>
            </div>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="py-2 pr-3 font-medium">{tr("Member")}</th>
                  <th className="py-2 pr-3 font-medium">{tr("Tier")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{tr("Points")}</th>
                  <th className="py-2 pr-3 font-medium text-right hidden sm:table-cell">{tr("6-month spend")}</th>
                  <th className="py-2 font-medium hidden md:table-cell">{tr("Last stay")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                    <td className="py-2.5 pr-3">
                      <Link href={`/loyalty/${m.id}`} className="font-semibold hover:underline">{m.name}</Link>
                      <div className="text-xs text-muted-foreground">{m.membershipNumber} · {m.phone ?? tr("no mobile")}</div>
                    </td>
                    <td className="py-2.5 pr-3"><TierBadge tier={m.tier} /></td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{formatPoints(m.points)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums hidden sm:table-cell">{formatInr(m.qualifyingSpend)}</td>
                    <td className="py-2.5 text-muted-foreground hidden md:table-cell">{m.lastStay ? format(new Date(m.lastStay), "d MMM yyyy") : "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">{tr("No members match these filters.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{total} {tr("members")}</span>
              <div className="flex gap-2">
                {page > 1 && <Link className="rounded-lg border px-3 py-1.5" href={"/loyalty?" + qs({ page: String(page - 1) })}>{tr("Previous")}</Link>}
                <span className="px-2 py-1.5">{page} / {pages}</span>
                {page < pages && <Link className="rounded-lg border px-3 py-1.5" href={"/loyalty?" + qs({ page: String(page + 1) })}>{tr("Next")}</Link>}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm h-fit">
          <h2 className="font-semibold">{tr("Upcoming expirations")}</h2>
          <p className="text-xs text-muted-foreground">{tr("Unused points expiring in the next 30 days. Members get a WhatsApp reminder.")}</p>
          <ul className="mt-3 divide-y divide-border/40">
            {overview.expiring.map((e, i) => (
              <li key={e.membershipId + i} className="py-2 flex items-center justify-between gap-2 text-sm">
                <Link href={`/loyalty/${e.membershipId}`} className="min-w-0">
                  <span className="font-medium hover:underline truncate block">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(e.expiresAt), "d MMM yyyy")}</span>
                </Link>
                <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{formatPoints(e.points)}</span>
              </li>
            ))}
            {overview.expiring.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{tr("Nothing expiring soon.")}</li>}
          </ul>
          <div className="mt-4 border-t border-border/40 pt-3 space-y-1.5 text-sm">
            {TIERS.map((t) => (
              <div key={t} className="flex items-center justify-between"><TierBadge tier={t} /><span className="font-semibold tabular-nums">{overview.counts[t] ?? 0}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
