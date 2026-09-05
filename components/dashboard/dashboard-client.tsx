"use client"

import { motion } from "framer-motion"
import { BedDouble, CalendarCheck, Users, TrendingUp } from "lucide-react"

type DashboardData = {
  todayArrivals: string;
  arrivalsTrend: string;
  availableUnits: string;
  unitsTrend: string;
  activeGuests: string;
  occupancyRate: string;
  arrivals: any[];
  pendingOperations: any[];
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const stats = [
    { 
      name: "Today's Check-ins", 
      value: data.todayArrivals, 
      icon: CalendarCheck, 
      trend: data.arrivalsTrend 
    },
    { 
      name: "Available Units", 
      value: data.availableUnits, 
      icon: BedDouble, 
      trend: data.unitsTrend
    },
    { 
      name: "Active Guests", 
      value: data.activeGuests, 
      icon: Users, 
      trend: "Currently checked in" 
    },
    { 
      name: "Occupancy Rate", 
      value: data.occupancyRate, 
      icon: TrendingUp, 
      trend: "Target: 85%" 
    },
  ]

  return (
    <div className="flex flex-col flex-1 h-full w-full gap-4 pb-4 min-h-0">
      {/* Hero Section - Sleek and Compact */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative shrink-0 overflow-hidden rounded-xl bg-slate-900 px-6 py-6 sm:px-8 border border-slate-800"
      >
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <motion.h1 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-2xl font-semibold tracking-tight text-white"
            >
              Welcome back, Admin
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-1 text-sm text-slate-400"
            >
              System is running smoothly. {data.arrivals.length} check-ins arriving today.
            </motion.p>
          </div>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="hidden sm:block text-right"
          >
             <p suppressHydrationWarning className="text-sm font-medium text-slate-300">
               {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
             </p>
             <p className="text-xs text-slate-500">Wonder Megacity</p>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats Grid - Clean Data */}
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
            className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
              <div className="rounded-md bg-slate-100 dark:bg-slate-800 p-2 text-slate-500">
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{stat.value}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{stat.trend}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions / Tables */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 flex-1 min-h-0"
      >
        <div className="col-span-4 flex flex-col rounded-xl border bg-card p-4 sm:p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Today's Arrivals</h3>
          </div>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
            {data.arrivals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No arrivals scheduled for today.</p>
            ) : (
              data.arrivals.map((reservation: any, i: number) => (
                <div key={reservation.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-semibold">
                      {reservation.guest.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{reservation.guest.name}</p>
                      <p className="text-xs text-muted-foreground">{reservation.unit?.name} • {reservation.unit?.type}</p>
                    </div>
                  </div>
                  <div suppressHydrationWarning className="text-xs font-medium text-slate-500">ETA {new Date(reservation.checkIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="col-span-3 flex flex-col rounded-xl border bg-card p-4 sm:p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Pending Operations</h3>
          </div>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-2">
            {data.pendingOperations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No pending operations.</p>
            ) : (
              data.pendingOperations.map((ticket: any) => {
                const isUrgent = ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH'
                return (
                  <div key={ticket.id} className={`rounded-md p-3 border ${isUrgent ? 'bg-destructive/10 border-destructive/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                    <div className={`flex items-center gap-2 text-sm font-medium ${isUrgent ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
                      <span className="relative flex h-2 w-2">
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isUrgent ? 'bg-destructive' : 'bg-amber-500'}`}></span>
                      </span>
                      {ticket.title} {ticket.unit ? `- ${ticket.unit.name}` : ''}
                    </div>
                    <p suppressHydrationWarning className={`text-xs mt-1 ml-4 ${isUrgent ? 'text-destructive/80' : 'text-amber-600/80 dark:text-amber-400/80'}`}>
                      {ticket.status} • Reported {new Date(ticket.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </motion.div>

      {/* Row 2: Departures / Unit Status */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 flex-1 min-h-0"
      >
        <div className="col-span-4 flex flex-col rounded-xl border bg-card p-4 sm:p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Today's Departures</h3>
          </div>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
            {data.departures?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No departures scheduled for today.</p>
            ) : (
              data.departures?.map((reservation: any, i: number) => (
                <div key={reservation.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-semibold">
                      {reservation.guest.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{reservation.guest.name}</p>
                      <p className="text-xs text-muted-foreground">{reservation.unit?.name} • {reservation.unit?.type}</p>
                    </div>
                  </div>
                  <div suppressHydrationWarning className="text-xs font-medium text-slate-500">Checkout {new Date(reservation.checkOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="col-span-3 flex flex-col rounded-xl border bg-card p-4 sm:p-5 shadow-sm min-h-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Unit Status</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 flex-1 min-h-0 content-start overflow-y-auto pr-1">
            {['AVAILABLE', 'OCCUPIED', 'DIRTY', 'CLEANING', 'READY', 'MAINTENANCE'].map(status => {
              const statusCount = data.unitStatuses?.find((u: any) => u.status === status)?._count?.id || 0;
              let colorClass = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              if (status === 'AVAILABLE' || status === 'READY') colorClass = "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900"
              if (status === 'OCCUPIED') colorClass = "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900"
              if (status === 'DIRTY' || status === 'MAINTENANCE') colorClass = "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900"
              if (status === 'CLEANING') colorClass = "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900"

              return (
                <div key={status} className={`flex flex-col items-center justify-center p-3 rounded-lg border ${colorClass}`}>
                  <span className="text-2xl font-bold">{statusCount}</span>
                  <span className="text-[10px] font-semibold tracking-wider uppercase mt-1 opacity-80">{status}</span>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
