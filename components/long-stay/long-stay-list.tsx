"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { format } from "date-fns"
import { BedDouble, CalendarRange, MapPin, Plus, Search, Wallet } from "lucide-react"
import { aboutMonths, formatInr, inclusionLabel, STATUSES } from "@/lib/long-stay/shared"
import type { LocationOption, LongStayRow } from "@/lib/long-stay/view"
import { AgreementBadgePill, StatusBadge } from "./badges"

interface Stats {
  staying: number
  upcoming: number
  depositsHeld: number
  depositsHeldCount: number
}

const fmt = (d: string) => format(new Date(d + "T00:00:00"), "d MMM yyyy")

const selectClass =
  "h-10 rounded-xl border border-border/60 bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"

export function LongStayList({ rows, stats, locations }: { rows: LongStayRow[]; stats: Stats; locations: LocationOption[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [location, setLocation] = useState("ALL")
  const [status, setStatus] = useState("ALL")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, "")
    return rows.filter((r) => {
      if (location !== "ALL" && r.locationId !== location) return false
      if (status !== "ALL" && r.status !== status) return false
      if (!q) return true
      return (
        r.guestName.toLowerCase().includes(q) ||
        (r.unitName ?? "").toLowerCase().includes(q) ||
        (qDigits.length >= 3 && r.contactNumber.replace(/\D/g, "").includes(qDigits))
      )
    })
  }, [rows, search, location, status])

  const cards = [
    { label: "Currently staying", value: String(stats.staying), icon: BedDouble, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { label: "Upcoming", value: String(stats.upcoming), icon: CalendarRange, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    {
      label: "Deposits held",
      value: formatInr(stats.depositsHeld),
      sub: `${stats.depositsHeldCount} ${stats.depositsHeldCount === 1 ? "stay" : "stays"}`,
      icon: Wallet,
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
  ]

  return (
    <div className="flex flex-col flex-1 w-full gap-4 sm:gap-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Long Stays</h1>
          <p className="text-sm text-muted-foreground mt-1">Monthly and extended stays booked directly by the team.</p>
        </div>
        <Link
          href="/long-stay/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New booking
        </Link>
      </div>

      <div className="grid gap-2.5 sm:gap-4 grid-cols-2 sm:grid-cols-3 shrink-0">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className={`group rounded-2xl border bg-card min-w-0 p-3 sm:p-4 shadow-sm transition-all duration-300 hover:shadow-md ${i === cards.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-3">
              <p className="text-xs sm:text-sm leading-snug font-medium text-muted-foreground">{c.label}</p>
              <div className={`shrink-0 rounded-xl p-1.5 sm:p-2 ${c.color} transition-transform duration-300 group-hover:scale-110`}>
                <c.icon className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">{c.value}</h2>
            {c.sub && <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>}
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search guest, phone or unit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>
          <div className="flex gap-3 sm:ml-auto">
            <label className="relative flex-1 sm:flex-none">
              <span className="sr-only">Location</span>
              <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectClass + " w-full sm:w-48"}>
                <option value="ALL">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
            <label className="relative flex-1 sm:flex-none">
              <span className="sr-only">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass + " w-full sm:w-40"}>
                <option value="ALL">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Phones: cards */}
        <div className="md:hidden divide-y divide-border/40">
          {filtered.length === 0 ? (
            <EmptyState hasRows={rows.length > 0} />
          ) : (
            filtered.map((r) => (
              <Link key={r.id} href={`/long-stay/${r.id}`} className="block p-4 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.guestName}</div>
                    <div className="text-xs text-muted-foreground">{r.contactNumber}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 text-sm">
                  {r.unitName ? `${r.unitName} · ` : ""}{r.locationName}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {fmt(r.checkIn)} → {fmt(r.checkOut)} · {r.nights} nights
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{formatInr(r.totalAmount)}</span>
                  <span className="text-muted-foreground">Deposit {formatInr(r.securityDeposit)}</span>
                  <span className="text-muted-foreground">In {r.checkInCount} · Out {r.checkOutCount}</span>
                  <AgreementBadgePill badge={r.agreement} />
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block flex-1 overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[11px] uppercase bg-muted/30 text-muted-foreground sticky top-0 z-10 border-b border-border/40">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Guest</th>
                <th className="px-5 py-3.5 font-semibold">Unit</th>
                <th className="px-5 py-3.5 font-semibold">Stay</th>
                <th className="px-5 py-3.5 font-semibold">Inclusion</th>
                <th className="px-5 py-3.5 font-semibold">Total</th>
                <th className="px-5 py-3.5 font-semibold">Deposit</th>
                <th className="px-5 py-3.5 font-semibold">Photos</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState hasRows={rows.length > 0} />
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/long-stay/${r.id}`)}
                    className="cursor-pointer hover:bg-muted/30 transition-colors duration-150"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500/15 to-red-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold text-sm">
                          {r.guestName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Link href={`/long-stay/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-foreground hover:underline">
                            {r.guestName}
                          </Link>
                          <div className="text-xs text-muted-foreground">{r.contactNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold">{r.unitName || "Unassigned"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{r.locationName}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{fmt(r.checkIn)} → {fmt(r.checkOut)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.nights} nights{aboutMonths(r.nights) ? ` · ${aboutMonths(r.nights)}` : ""}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs max-w-[180px] whitespace-normal">{inclusionLabel(r.inclusion)}</td>
                    <td className="px-5 py-3.5 font-semibold">{formatInr(r.totalAmount)}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{formatInr(r.securityDeposit)}</div>
                      <div className="text-[11px] text-muted-foreground">{r.depositRefundedOn ? `Refunded ${fmt(r.depositRefundedOn)}` : r.securityDeposit > 0 ? "Held" : "—"}</div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">In {r.checkInCount} · Out {r.checkOutCount}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusBadge status={r.status} />
                        <AgreementBadgePill badge={r.agreement} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}

function EmptyState({ hasRows }: { hasRows: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center text-muted-foreground">
      <CalendarRange className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm font-medium">{hasRows ? "No long stays match your filters." : "No long stays yet."}</p>
      {!hasRows && (
        <Link href="/long-stay/new" className="mt-3 text-sm font-semibold text-primary hover:underline">
          Create the first booking
        </Link>
      )}
    </div>
  )
}

