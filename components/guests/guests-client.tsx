"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Search, Filter, MoreHorizontal, Users, Star, UserPlus, CreditCard, ShieldCheck } from "lucide-react"

type GuestStats = {
  total: number
  members: number
  vips: number
  activeStays: number
}

export function GuestsClient({ 
  initialData, 
  stats 
}: { 
  initialData: any[],
  stats: GuestStats
}) {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredData = initialData.filter((guest: any) => 
    guest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guest.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guest.phone.includes(searchTerm)
  )

  const getTierBadge = (tier: string) => {
    switch(tier) {
      case 'DIAMOND':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-700/10 dark:bg-violet-900/30 dark:text-violet-400 dark:ring-violet-400/20"><Star className="h-3 w-3 fill-violet-700 dark:fill-violet-400" /> Diamond</span>
      case 'PLATINUM':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-600/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20"><ShieldCheck className="h-3 w-3" /> Platinum</span>
      case 'GOLD':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-400/20"><Star className="h-3 w-3" /> Gold</span>
      case 'STANDARD':
        return <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-400/20">Standard</span>
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full gap-6 pb-4 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Guest Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage guest profiles, memberships, and history.</p>
        </div>
        <button className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Guest
        </button>
      </div>

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Guests", value: stats.total, icon: Users },
          { label: "Active Members", value: stats.members, icon: CreditCard },
          { label: "VIP Guests", value: stats.vips, icon: Star },
          { label: "In-House Guests", value: stats.activeStays, icon: ShieldCheck }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className="rounded-md bg-slate-100 dark:bg-slate-800 p-2 text-slate-500">
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <h2 className="text-2xl font-semibold tracking-tight">{stat.value}</h2>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900 text-slate-500 sticky top-0 z-10 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold">Guest</th>
                <th className="px-6 py-4 font-semibold">Contact Info</th>
                <th className="px-6 py-4 font-semibold">Membership</th>
                <th className="px-6 py-4 font-semibold">Total Stays</th>
                <th className="px-6 py-4 font-semibold">Total Spend</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No guests found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredData.map((guest: any) => {
                  const totalStays = guest.reservations.length
                  const totalSpend = guest.reservations.reduce((sum: number, r: any) => sum + r.totalAmount, 0)
                  
                  return (
                    <tr key={guest.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                            {guest.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">{guest.name}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">ID: {guest.id.substring(guest.id.length - 6)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">{guest.phone}</div>
                        <div className="text-xs text-muted-foreground">{guest.email || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        {guest.membership ? (
                          <div className="flex flex-col gap-1 items-start">
                            {getTierBadge(guest.membership.tier)}
                            <span className="text-[10px] text-muted-foreground font-medium">{guest.membership.points} pts</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No membership</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{totalStays}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-emerald-600 dark:text-emerald-400">${totalSpend.toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
