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
    <div className="flex flex-col gap-8 pb-8">
      {/* Hero Section with High-Res Background & Glassmorphism */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl bg-slate-900 px-6 py-16 sm:px-12 sm:py-24"
      >
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80"
            alt="Luxury Hotel Lobby"
            className="h-full w-full object-cover opacity-40 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
        </div>
        
        <div className="relative z-10 max-w-2xl">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            Welcome back, Admin
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-4 text-lg text-slate-300"
          >
            Wonder Megacity is currently running smoothly. You have 12 check-ins arriving today and 3 high-priority maintenance tickets.
          </motion.p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
            className="relative overflow-hidden rounded-xl border bg-card/50 backdrop-blur-xl p-6 shadow-sm transition-all hover:shadow-md hover:bg-card/80"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
              <div className="rounded-md bg-primary/10 p-2">
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <h2 className="text-3xl font-semibold tracking-tight">{stat.value}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{stat.trend}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions / Recent Activity Placeholder */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-7"
      >
        <div className="col-span-4 rounded-xl border bg-card/50 backdrop-blur-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold tracking-tight mb-4">Today's Arrivals</h3>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                    G{i}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Guest Name {i}</p>
                    <p className="text-xs text-muted-foreground">Unit 10{i} • Deluxe Room</p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">ETA: 14:00</div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="col-span-3 rounded-xl border bg-card/50 backdrop-blur-xl p-6 shadow-sm relative overflow-hidden">
           <img
            src="https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&q=80"
            alt="Hotel Room"
            className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity"
          />
          <div className="relative z-10">
            <h3 className="text-lg font-semibold tracking-tight mb-4">Pending Operations</h3>
            <div className="space-y-3">
              <div className="rounded-lg bg-background/80 backdrop-blur-md p-3 border shadow-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                  </span>
                  AC Malfunction - Room 204
                </div>
                <p className="text-xs text-muted-foreground mt-1">Reported 2 hours ago</p>
              </div>
              <div className="rounded-lg bg-background/80 backdrop-blur-md p-3 border shadow-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  Checkout Cleaning - Room 201
                </div>
                <p className="text-xs text-muted-foreground mt-1">Scheduled for 11:00 AM</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
