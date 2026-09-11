"use client"

import { motion } from "framer-motion"
import { BedDouble, CalendarCheck, Users, TrendingUp, ArrowUpRight, Clock, AlertCircle, CheckCircle2 } from "lucide-react"

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
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const stats = [
    { 
      name: "Today's Check-ins", 
      value: data.todayArrivals, 
      icon: CalendarCheck, 
      trend: data.arrivalsTrend,
      color: "from-rose-500 to-red-600",
      lightColor: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
    },
    { 
      name: "Available Units", 
      value: data.availableUnits, 
      icon: BedDouble, 
      trend: data.unitsTrend,
      color: "from-emerald-500 to-teal-600",
      lightColor: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
    },
    { 
      name: "Active Guests", 
      value: data.activeGuests, 
      icon: Users, 
      trend: "Currently checked in",
      color: "from-blue-500 to-cyan-600",
      lightColor: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
    },
    { 
      name: "Occupancy Rate", 
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
        className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4a0518] via-[#5c0a20] to-[#3a0312] px-6 py-6 sm:px-8 border border-white/[0.08]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-red-500/5 via-transparent to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <motion.h1 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-2xl font-bold tracking-tight text-white"
            >
              Welcome back, Admin
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="mt-1.5 text-sm text-slate-400"
            >
              System is running smoothly. <span className="text-rose-300 font-medium">{data.arrivals.length} check-ins</span> arriving today.
            </motion.p>
          </div>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="hidden sm:block text-right mt-3 sm:mt-0"
          >
             <p suppressHydrationWarning className="text-sm font-semibold text-white/90">
               {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
             </p>
             <p className="text-xs text-slate-500 mt-0.5">Wonder Megacity</p>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="group relative rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
              <div className={`rounded-xl p-2 ${stat.lightColor} transition-transform duration-300 group-hover:scale-110`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-bold tracking-tight">{stat.value}</h2>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              {stat.trend}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions / Tables */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 flex-1 min-h-0"
      >
        <div className="col-span-4 flex flex-col rounded-2xl border bg-card p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 p-1.5">
                <Clock className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">Today&apos;s Arrivals</h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">{data.arrivals.length} total</span>
          </div>
          <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-1">
            {data.arrivals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CalendarCheck className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No arrivals scheduled for today.</p>
              </div>
            ) : (
              data.arrivals.map((reservation: any) => (
                <div key={reservation.id} className="flex items-center justify-between rounded-xl p-3 hover:bg-muted/50 transition-colors duration-200">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-red-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 text-sm font-bold">
                      {reservation.guest.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{reservation.guest.name}</p>
                      <p className="text-xs text-muted-foreground">{reservation.unit?.name} &middot; {reservation.unit?.type}</p>
                    </div>
                  </div>
                  <div suppressHydrationWarning className="text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                    ETA {new Date(reservation.checkIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="col-span-3 flex flex-col rounded-2xl border bg-card p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-1.5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">Pending Operations</h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">{data.pendingOperations.length}</span>
          </div>
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
            {data.pendingOperations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No pending operations.</p>
              </div>
            ) : (
              data.pendingOperations.map((ticket: any) => {
                const isUrgent = ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH'
                return (
                  <div key={ticket.id} className={`rounded-xl p-3.5 border transition-colors duration-200 ${
                    isUrgent 
                      ? 'bg-red-50/80 border-red-200/60 dark:bg-red-500/5 dark:border-red-500/15' 
                      : 'bg-amber-50/80 border-amber-200/60 dark:bg-amber-500/5 dark:border-amber-500/15'
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`relative flex h-2 w-2 shrink-0`}>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                      </span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {ticket.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold ${isUrgent ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {ticket.category.replace('_', ' ')}
                      </span>
                      {ticket.unit && (
                        <span className="text-xs text-muted-foreground">&middot; {ticket.unit.name}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ticket.description}</p>
                  </div>
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
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 flex-1 min-h-0"
      >
        <div className="col-span-4 flex flex-col rounded-2xl border bg-card p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">Today&apos;s Departures</h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">{data.departures?.length || 0} total</span>
          </div>
          <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-1">
            {data.departures?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No departures scheduled for today.</p>
              </div>
            ) : (
              data.departures?.map((reservation: any) => (
                <div key={reservation.id} className="flex items-center justify-between rounded-xl p-3 hover:bg-muted/50 transition-colors duration-200">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                      {reservation.guest.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{reservation.guest.name}</p>
                      <p className="text-xs text-muted-foreground">{reservation.unit?.name} &middot; {reservation.unit?.type}</p>
                    </div>
                  </div>
                  <div suppressHydrationWarning className="text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                    Checkout {new Date(reservation.checkOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="col-span-3 flex flex-col rounded-2xl border bg-card p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 p-1.5">
                <BedDouble className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">Unit Status</h3>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 flex-1 min-h-0 content-start overflow-y-auto pr-1">
            {['AVAILABLE', 'OCCUPIED', 'DIRTY', 'CLEANING', 'READY', 'MAINTENANCE'].map(status => {
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
                <div key={status} className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 hover:scale-[1.02] ${colorClass}`}>
                  <span className="text-2xl font-bold">{statusCount}</span>
                  <span className="text-[10px] font-semibold tracking-wider uppercase mt-1 opacity-70">{status}</span>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
