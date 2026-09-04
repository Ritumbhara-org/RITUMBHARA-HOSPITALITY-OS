"use client"

import { motion } from "framer-motion"
import { BedDouble, CalendarCheck, Users, TrendingUp } from "lucide-react"

const stats = [
  { name: "Today's Check-ins", value: "12", icon: CalendarCheck, trend: "+2 from yesterday" },
  { name: "Available Units", value: "8", icon: BedDouble, trend: "4 dirty, 4 clean" },
  { name: "Active Guests", value: "45", icon: Users, trend: "+12% this week" },
  { name: "Occupancy Rate", value: "82%", icon: TrendingUp, trend: "Target: 85%" },
]

export default function DashboardPage() {
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
              System is running smoothly. 12 check-ins arriving today.
            </motion.p>
          </div>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="hidden sm:block text-right"
          >
             <p className="text-sm font-medium text-slate-300">September 4, 2026</p>
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
        <div className="col-span-4 flex flex-col rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Today's Arrivals</h3>
          </div>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-semibold">
                    G{i}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Guest Name {i}</p>
                    <p className="text-xs text-muted-foreground">Unit 10{i} • Deluxe Room</p>
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-500">ETA 14:00</div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="col-span-3 flex flex-col rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 shrink-0">
             <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Pending Operations</h3>
          </div>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-2">
            <div className="rounded-md bg-destructive/10 p-3 border border-destructive/20">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                </span>
                AC Malfunction - Room 204
              </div>
              <p className="text-xs text-destructive/80 mt-1 ml-4">Reported 2 hours ago</p>
            </div>
            <div className="rounded-md bg-amber-500/10 p-3 border border-amber-500/20">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Checkout Cleaning - Room 201
              </div>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1 ml-4">Scheduled for 11:00 AM</p>
            </div>
            <div className="rounded-md bg-amber-500/10 p-3 border border-amber-500/20">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Checkout Cleaning - Room 208
              </div>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1 ml-4">Scheduled for 11:30 AM</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
