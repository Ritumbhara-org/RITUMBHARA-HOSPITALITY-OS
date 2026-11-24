"use client"

import { motion } from "framer-motion"
import { BedDouble, CalendarCheck, Users, TrendingUp, ArrowUpRight, Clock, AlertCircle, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { useLanguage, useTr } from "@/components/i18n/language-provider"
import { DashboardDetails, UNIT_STATUSES, type Detail } from "@/components/dashboard/dashboard-details"

// Shared look for anything on the dashboard that opens the details panel.
const clickable = "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

type DashboardData = {
  todayArrivals: string;
  arrivalsTrend: string;
  availableUnits: string;
  unitsTrend: string;
  activeGuests: string;
  occupancyRate: string;
  arrivals: any[];
  departures: any[];
  pendingOperations: any[];
  unitStatuses: any[];
  units: any[];
  activeStays: any[];
  lowInventory: any[];
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const tr = useTr()
  const { lang } = useLanguage()
  const [stack, setStack] = useState<Detail[]>([])
  const open = (d: Detail) => setStack([d])
  const push = (d: Detail) => setStack((s) => [...s, d])
  const stats = [
    { 
      name: "Today's Check-ins", 
      detail: { kind: "arrivals" } as Detail,
      value: data.todayArrivals, 
      icon: CalendarCheck, 
      trend: data.arrivalsTrend,
      color: "from-rose-500 to-red-600",
      lightColor: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
    },
    { 
      name: "Available Units", 
      detail: { kind: "availableUnits" } as Detail,
      value: data.availableUnits, 
      icon: BedDouble, 
      trend: data.unitsTrend,
      color: "from-emerald-500 to-teal-600",
      lightColor: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
    },
    { 
      name: "Active Guests", 
      detail: { kind: "activeGuests" } as Detail,
      value: data.activeGuests, 
      icon: Users, 
      trend: "Currently checked in",
      color: "from-blue-500 to-cyan-600",
      lightColor: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
    },
    { 
      name: "Occupancy Rate", 
      detail: { kind: "occupancy" } as Detail,
      value: data.occupancyRate, 
      icon: TrendingUp, 
      trend: "Target: 85%",
      color: "from-amber-500 to-orange-600",
      lightColor: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
    },
  ]

  return (
    <div className="flex flex-col flex-1 w-full gap-5 pb-4">
      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4a0518] via-[#5c0a20] to-[#3a0312] px-5 py-5 sm:px-8 sm:py-6 border border-white/[0.08]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-red-500/5 via-transparent to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <motion.h1 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-xl sm:text-2xl font-bold tracking-tight text-white"
            >
              {tr("Welcome back, Admin")}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="mt-1.5 text-sm text-rose-100/70"
            >
              {tr("System is running smoothly.")} <span className="text-white font-medium">{data.arrivals.length} {tr("check-ins")}</span> {tr("arriving today.")}
            </motion.p>
          </div>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="hidden sm:block text-right mt-3 sm:mt-0"
          >
             <p suppressHydrationWarning className="text-sm font-semibold text-white/90">
               {new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
             </p>
             <p className="text-xs text-rose-200/50 mt-0.5">{tr("Ritumbhara Hotels")}</p>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.button
            type="button"
            key={stat.name}
            onClick={() => open(stat.detail)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className={`group relative min-w-0 rounded-2xl border bg-card p-3.5 sm:p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80 hover:-translate-y-0.5 overflow-hidden text-left ${clickable}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
              <p className="text-xs sm:text-sm font-medium leading-snug text-muted-foreground">{tr(stat.name)}</p>
              <div className={`shrink-0 rounded-xl p-1.5 sm:p-2 ${stat.lightColor} transition-transform duration-300 group-hover:scale-110`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{stat.value}</h2>
            </div>
            <p className="mt-1.5 text-[11px] sm:text-xs text-muted-foreground flex items-start gap-1">
              <ArrowUpRight className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{tr(stat.trend)}</span>
            </p>
          </motion.button>
        ))}
      </div>

      {/* Quick Actions / Tables */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-4 lg:grid-cols-7 lg:flex-1 lg:min-h-0"
      >
        <div className="lg:col-span-4 flex min-w-0 flex-col rounded-2xl border bg-card p-4 sm:p-5 shadow-sm lg:min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 p-1.5">
                <Clock className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight"><button type="button" onClick={() => open({ kind: "arrivals" })} className={`hover:underline underline-offset-4 ${clickable}`}>{tr("Today's Arrivals")}</button></h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">{data.arrivals.length} {tr("total")}</span>
          </div>
          <div className="space-y-1 lg:overflow-y-auto lg:flex-1 lg:min-h-0 lg:pr-1">
            {data.arrivals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CalendarCheck className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">{tr("No arrivals scheduled for today.")}</p>
              </div>
            ) : (
              data.arrivals.map((reservation: any) => (
                <button type="button" onClick={() => open({ kind: "reservation", reservation })} key={reservation.id} className={`flex w-full text-left items-center justify-between gap-3 rounded-xl -mx-1 p-2 sm:mx-0 sm:p-3 hover:bg-muted/50 transition-colors duration-200 ${clickable}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-rose-500/20 to-red-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 text-sm font-bold">
                      {reservation.guest.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{reservation.guest.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{reservation.unit?.name} &middot; {reservation.unit?.type}</p>
                    </div>
                  </div>
                  <div suppressHydrationWarning className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                    {tr("ETA")} {new Date(reservation.checkIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        
        <div className="lg:col-span-3 flex min-w-0 flex-col rounded-2xl border bg-card p-4 sm:p-5 shadow-sm lg:min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-1.5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight"><button type="button" onClick={() => open({ kind: "tickets" })} className={`hover:underline underline-offset-4 ${clickable}`}>{tr("Pending Operations")}</button></h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">{data.pendingOperations.length}</span>
          </div>
          <div className="space-y-2 lg:overflow-y-auto lg:flex-1 lg:min-h-0 lg:pr-1">
            {data.pendingOperations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">{tr("No pending operations.")}</p>
              </div>
            ) : (
              data.pendingOperations.map((ticket: any) => {
                const isUrgent = ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH'
                return (
                  <button type="button" onClick={() => open({ kind: "ticket", ticket })} key={ticket.id} className={`block w-full text-left rounded-xl p-3.5 border transition-colors duration-200 hover:brightness-[0.97] ${clickable} ${
                    isUrgent 
                      ? 'bg-red-50/80 border-red-200/60 dark:bg-red-500/5 dark:border-red-500/15' 
                      : 'bg-amber-50/80 border-amber-200/60 dark:bg-amber-500/5 dark:border-amber-500/15'
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`relative flex h-2 w-2 shrink-0`}>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                      </span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {tr(ticket.priority)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold ${isUrgent ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {tr(ticket.category.replace('_', ' '))}
                      </span>
                      {ticket.unit && (
                        <span className="text-xs text-muted-foreground">&middot; {ticket.unit.name}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ticket.description}</p>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </motion.div>

      {/* Row 2: Departures / Unit Status */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-4 lg:grid-cols-7 lg:flex-1 lg:min-h-0"
      >
        <div className="lg:col-span-4 flex min-w-0 flex-col rounded-2xl border bg-card p-4 sm:p-5 shadow-sm lg:min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight"><button type="button" onClick={() => open({ kind: "departures" })} className={`hover:underline underline-offset-4 ${clickable}`}>{tr("Today's Departures")}</button></h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">{data.departures?.length || 0} {tr("total")}</span>
          </div>
          <div className="space-y-1 lg:overflow-y-auto lg:flex-1 lg:min-h-0 lg:pr-1">
            {data.departures?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">{tr("No departures scheduled for today.")}</p>
              </div>
            ) : (
              data.departures?.map((reservation: any) => (
                <button type="button" onClick={() => open({ kind: "reservation", reservation })} key={reservation.id} className={`flex w-full text-left items-center justify-between gap-3 rounded-xl -mx-1 p-2 sm:mx-0 sm:p-3 hover:bg-muted/50 transition-colors duration-200 ${clickable}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                      {reservation.guest.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{reservation.guest.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{reservation.unit?.name} &middot; {reservation.unit?.type}</p>
                    </div>
                  </div>
                  <div suppressHydrationWarning className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                    {tr("Checkout")} {new Date(reservation.checkOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3 flex min-w-0 flex-col rounded-2xl border bg-card p-4 sm:p-5 shadow-sm lg:min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 p-1.5">
                <BedDouble className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">{tr("Unit Status")}</h3>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 lg:flex-1 lg:min-h-0 content-start lg:overflow-y-auto lg:pr-1">
            {UNIT_STATUSES.map(status => {
              const statusCount = data.unitStatuses?.find((u: any) => u.status === status)?._count?.id || 0;
              const statusStyles: Record<string, string> = {
                AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/8 dark:text-emerald-400 dark:border-emerald-500/15",
                READY: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/8 dark:text-emerald-400 dark:border-emerald-500/15",
                OCCUPIED: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/8 dark:text-blue-400 dark:border-blue-500/15",
                DIRTY: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/8 dark:text-rose-400 dark:border-rose-500/15",
                CLEANING: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/8 dark:text-amber-400 dark:border-amber-500/15",
                MAINTENANCE: "bg-orange-50 text-orange-700 border-orange-200/80 dark:bg-orange-500/8 dark:text-orange-400 dark:border-orange-500/15",
              }
              const colorClass = statusStyles[status] || "bg-muted text-muted-foreground border-border"
              return (
                <button type="button" onClick={() => open({ kind: "unitStatus", status })} key={status} className={`flex min-w-0 flex-col items-center justify-center px-1 py-3 rounded-xl border transition-all duration-200 hover:scale-[1.02] ${clickable} ${colorClass}`}>
                  <span className="text-2xl font-bold">{statusCount}</span>
                  <span className="mt-1 max-w-full truncate text-[11px] font-semibold capitalize opacity-80">{tr(status.toLowerCase())}</span>
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Row 3: Low Inventory */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-4 lg:flex-1 lg:min-h-0"
      >
        <div className="flex min-w-0 flex-col rounded-2xl border bg-card p-4 sm:p-5 shadow-sm lg:min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 p-1.5">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight"><button type="button" onClick={() => open({ kind: "lowInventory" })} className={`hover:underline underline-offset-4 ${clickable}`}>{tr("Low Inventory Alerts")}</button></h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">{data.lowInventory?.length || 0} {tr("items")}</span>
          </div>
          <div className="space-y-2 lg:overflow-y-auto lg:flex-1 lg:min-h-0 lg:pr-1">
            {data.lowInventory?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">{tr("All stock levels healthy.")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.lowInventory?.map((item: any) => (
                  <button type="button" onClick={() => open({ kind: "inventoryItem", item })} key={item.id} className={`flex w-full text-left items-center justify-between gap-3 rounded-xl p-3 border hover:brightness-[0.97] ${clickable} bg-red-50/50 border-red-200/50 dark:bg-red-900/10 dark:border-red-900/30`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-red-900 dark:text-red-300">{item.name}</p>
                      <p className="text-xs text-red-700/70 dark:text-red-400/70">
                        {tr(item.category)} &middot; {item.property?.name || tr("All Properties")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">{item.quantity} <span className="text-xs font-normal opacity-70">{item.unit}</span></p>
                      <p className="text-[10px] text-red-600/70 dark:text-red-400/70 uppercase font-semibold">{tr("Min:")} {item.minThreshold}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <DashboardDetails
        stack={stack}
        onPush={push}
        onBack={() => setStack((s) => s.slice(0, -1))}
        onClose={() => setStack([])}
        data={{
          arrivals: data.arrivals,
          departures: data.departures ?? [],
          activeStays: data.activeStays ?? [],
          units: data.units ?? [],
          pendingOperations: data.pendingOperations,
          lowInventory: data.lowInventory ?? [],
          occupancyRate: data.occupancyRate,
        }}
      />
    </div>
  )
}
