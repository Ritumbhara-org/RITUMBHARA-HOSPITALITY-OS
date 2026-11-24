"use client"

// Side panel the dashboard opens when a card, row or tile is clicked.
// Lists drill down into single items; "Back" returns to the list.

import Link from "next/link"
import { ArrowLeft, ArrowUpRight, ChevronRight } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useLanguage, useTr } from "@/components/i18n/language-provider"

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Detail =
  | { kind: "arrivals" }
  | { kind: "departures" }
  | { kind: "activeGuests" }
  | { kind: "availableUnits" }
  | { kind: "occupancy" }
  | { kind: "tickets" }
  | { kind: "lowInventory" }
  | { kind: "unitStatus"; status: string }
  | { kind: "reservation"; reservation: any }
  | { kind: "ticket"; ticket: any }
  | { kind: "inventoryItem"; item: any }

export type DetailData = {
  arrivals: any[]
  departures: any[]
  activeStays: any[]
  units: any[]
  pendingOperations: any[]
  lowInventory: any[]
  occupancyRate: string
}

export const UNIT_STATUSES = ["AVAILABLE", "OCCUPIED", "DIRTY", "CLEANING", "READY", "MAINTENANCE"]

export function DashboardDetails({
  stack,
  onPush,
  onBack,
  onClose,
  data,
}: {
  stack: Detail[]
  onPush: (d: Detail) => void
  onBack: () => void
  onClose: () => void
  data: DetailData
}) {
  const tr = useTr()
  const { lang } = useLanguage()
  const locale = lang === "hi" ? "hi-IN" : "en-IN"
  const current = stack[stack.length - 1]

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short" })
  const nights = (a: string | Date, b: string | Date) =>
    Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000))

  const reservationRow = (r: any, right: string) => (
    <Row key={r.id} onClick={() => onPush({ kind: "reservation", reservation: r })} title={r.guest?.name} subtitle={[r.unit?.name, r.property?.name].filter(Boolean).join(" · ")} right={right} />
  )
  const unitRow = (u: any) => (
    <Row key={u.id} href="/units" title={u.name} subtitle={[u.type, u.property?.name].filter(Boolean).join(" · ")} right={tr(u.status.toLowerCase())} />
  )

  let title = ""
  let description = ""
  let body: React.ReactNode = null
  let link: { href: string; label: string } | null = null

  if (current) {
    switch (current.kind) {
      case "arrivals":
        title = tr("Today's Arrivals")
        description = tr("{n} guests checking in today", { n: data.arrivals.length })
        body = <List empty={tr("No arrivals scheduled for today.")}>{data.arrivals.map((r) => reservationRow(r, `${tr("ETA")} ${fmtDate(r.checkIn)}`))}</List>
        link = { href: "/reservations", label: tr("All reservations") }
        break
      case "departures":
        title = tr("Today's Departures")
        description = tr("{n} guests checking out today", { n: data.departures.length })
        body = <List empty={tr("No departures scheduled for today.")}>{data.departures.map((r) => reservationRow(r, `${tr("Checkout")} ${fmtDate(r.checkOut)}`))}</List>
        link = { href: "/reservations", label: tr("All reservations") }
        break
      case "activeGuests":
        title = tr("Active Guests")
        description = tr("{n} guests checked in right now", { n: data.activeStays.length })
        body = <List empty={tr("No guests checked in.")}>{data.activeStays.map((r) => reservationRow(r, `${tr("Checkout")} ${fmtDay(r.checkOut)}`))}</List>
        link = { href: "/guests", label: tr("All guests") }
        break
      case "availableUnits":
      case "unitStatus": {
        const status = current.kind === "availableUnits" ? "AVAILABLE" : current.status
        const units = data.units.filter((u) => u.status === status)
        title = tr("{status} units", { status: tr(status.toLowerCase()) })
        description = tr("{n} of {total} units", { n: units.length, total: data.units.length })
        body = <List empty={tr("No units in this status.")}>{units.map(unitRow)}</List>
        link = { href: "/units", label: tr("Manage units") }
        break
      }
      case "occupancy": {
        const total = data.units.length
        title = tr("Occupancy Rate")
        description = tr("{rate} of {total} units are not available to sell", { rate: data.occupancyRate, total })
        body = (
          <div className="space-y-2">
            {UNIT_STATUSES.map((status) => {
              const n = data.units.filter((u) => u.status === status).length
              const pct = total > 0 ? Math.round((n / total) * 100) : 0
              return (
                <button key={status} type="button" onClick={() => onPush({ kind: "unitStatus", status })} className="w-full rounded-xl border p-3 text-left hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{tr(status.toLowerCase())}</span>
                    <span className="text-muted-foreground">{n} · {pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        )
        link = { href: "/analytics", label: tr("Open analytics") }
        break
      }
      case "tickets":
        title = tr("Pending Operations")
        description = tr("Most urgent open tickets")
        body = (
          <List empty={tr("No pending operations.")}>
            {data.pendingOperations.map((t) => (
              <Row key={t.id} onClick={() => onPush({ kind: "ticket", ticket: t })} title={tr(t.category.replace(/_/g, " "))} subtitle={t.description} right={tr(t.priority)} />
            ))}
          </List>
        )
        link = { href: "/operations", label: tr("All tickets") }
        break
      case "lowInventory":
        title = tr("Low Inventory Alerts")
        description = tr("Items below their minimum stock")
        body = (
          <List empty={tr("All stock levels healthy.")}>
            {data.lowInventory.map((i) => (
              <Row key={i.id} onClick={() => onPush({ kind: "inventoryItem", item: i })} title={i.name} subtitle={i.property?.name || tr("All Properties")} right={`${i.quantity} / ${i.minThreshold} ${i.unit}`} />
            ))}
          </List>
        )
        link = { href: "/inventory", label: tr("Open inventory") }
        break
      case "reservation": {
        const r = current.reservation
        title = r.guest?.name ?? tr("Reservation")
        description = [r.unit?.name, r.property?.name].filter(Boolean).join(" · ")
        body = (
          <Fields
            rows={[
              [tr("Status"), tr(String(r.status).replace(/_/g, " ").toLowerCase())],
              [tr("Check-in"), fmtDate(r.checkIn)],
              [tr("Check-out"), fmtDate(r.checkOut)],
              [tr("Nights"), String(nights(r.checkIn, r.checkOut))],
              [tr("Unit"), [r.unit?.name, r.unit?.type, r.unit?.floor && `${tr("Floor")} ${r.unit.floor}`].filter(Boolean).join(" · ")],
              [tr("Phone"), r.guest?.phone],
              [tr("Email"), r.guest?.email],
              [tr("Source"), r.source],
              [tr("Amount"), r.totalAmount ? `₹${Math.round(r.totalAmount).toLocaleString("en-IN")}` : null],
              [tr("Notes"), r.bookingNotes],
            ]}
          />
        )
        link = r.guest?.id ? { href: `/guests/${r.guest.id}`, label: tr("Open guest profile") } : { href: "/reservations", label: tr("All reservations") }
        break
      }
      case "ticket": {
        const t = current.ticket
        title = tr(t.category.replace(/_/g, " "))
        description = [t.unit?.name, t.property?.name].filter(Boolean).join(" · ")
        body = (
          <>
            <p className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">{t.description}</p>
            <Fields
              rows={[
                [tr("Priority"), tr(t.priority)],
                [tr("Status"), tr(String(t.status).replace(/_/g, " ").toLowerCase())],
                [tr("Subcategory"), t.subcategory],
                [tr("Assigned to"), t.assignedTo?.name ?? tr("Unassigned")],
                [tr("Reported"), fmtDate(t.createdAt)],
                [tr("SLA due"), fmtDate(t.slaDeadline)],
              ]}
            />
          </>
        )
        link = { href: "/operations", label: tr("Open in Operations") }
        break
      }
      case "inventoryItem": {
        const i = current.item
        title = i.name
        description = i.property?.name || tr("All Properties")
        body = (
          <Fields
            rows={[
              [tr("In stock"), `${i.quantity} ${i.unit}`],
              [tr("Minimum"), `${i.minThreshold} ${i.unit}`],
              [tr("Short by"), `${Math.max(0, i.minThreshold - i.quantity)} ${i.unit}`],
              [tr("Category"), tr(i.category)],
            ]}
          />
        )
        link = { href: "/inventory", label: tr("Open inventory") }
        break
      }
    }
  }

  return (
    <Sheet open={stack.length > 0} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {current && (
          <>
            <SheetHeader className="pr-10">
              {stack.length > 1 && (
                <button type="button" onClick={onBack} className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3.5 w-3.5" /> {tr("Back")}
                </button>
              )}
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </SheetHeader>
            <div className="flex-1 px-4 space-y-3">{body}</div>
            {link && (
              <div className="border-t p-4">
                <Link href={link.href} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  {link.label} <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function List({ children, empty }: { children: React.ReactNode[]; empty: string }) {
  if (children.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
  return <div className="space-y-1">{children}</div>
}

function Row({ title, subtitle, right, onClick, href }: { title: string; subtitle?: string; right?: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <span suppressHydrationWarning className="shrink-0 whitespace-nowrap rounded-lg bg-muted/60 px-2 py-1 text-xs font-medium text-muted-foreground">{right}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </>
  )
  const cls = "flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted/50 transition-colors"
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

function Fields({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <dl className="divide-y rounded-xl border">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm">
          <dt className="shrink-0 text-muted-foreground">{k}</dt>
          <dd suppressHydrationWarning className="min-w-0 text-right font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
