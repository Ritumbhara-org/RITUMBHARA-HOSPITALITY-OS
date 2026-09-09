"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Search, Filter, MoreHorizontal, Users, Star, UserPlus, CreditCard, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createGuest, updateGuest } from "@/app/actions/guests"
import Link from "next/link"

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
  const [filterMembership, setFilterMembership] = useState("ALL")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [editGuest, setEditGuest] = useState<any>(null)
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)

  const filteredData = initialData.filter((guest: any) => {
    const matchesSearch = guest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guest.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guest.phone.includes(searchTerm)
    
    if (filterMembership === "ALL") return matchesSearch;
    if (filterMembership === "NONE") return matchesSearch && !guest.membership;
    return matchesSearch && guest.membership?.tier === filterMembership;
  })

  const getTierBadge = (tier: string) => {
    switch(tier) {
      case 'DIAMOND':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-700/10 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20"><Star className="h-3 w-3 fill-violet-700 dark:fill-violet-400" /> Diamond</span>
      case 'PLATINUM':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-600/15 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/20"><ShieldCheck className="h-3 w-3" /> Platinum</span>
      case 'GOLD':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20"><Star className="h-3 w-3" /> Gold</span>
      case 'STANDARD':
        return <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20">Standard</span>
      default:
        return null
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const result = await createGuest(formData)
    setIsSubmitting(false)
    if (result.success) {
      setIsDialogOpen(false)
    } else {
      alert("Failed to create guest: " + result.error)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editGuest) return
    setIsEditSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const result = await updateGuest(editGuest.id, formData)
    setIsEditSubmitting(false)
    if (result.success) {
      setEditGuest(null)
    } else {
      alert("Failed to update guest: " + result.error)
    }
  }

  return (
    <div className="flex flex-col flex-1 w-full gap-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Guest Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage guest profiles, memberships, and history.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]">
            <UserPlus className="h-4 w-4" />
            Add Guest
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle className="text-lg">Add Guest</DialogTitle>
                <DialogDescription>Register a new guest profile.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input id="name" name="name" placeholder="John Doe" required className="rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input id="phone" name="phone" placeholder="+1 234 567 8900" required className="rounded-xl" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" type="email" placeholder="john@example.com" className="rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="idType">ID Type</Label>
                    <Select name="idType">
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select ID" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PASSPORT">Passport</SelectItem>
                        <SelectItem value="DRIVERS_LICENSE">Driver&apos;s License</SelectItem>
                        <SelectItem value="NATIONAL_ID">National ID</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="idNumber">ID Number</Label>
                    <Input id="idNumber" name="idNumber" placeholder="AB1234567" className="rounded-xl" />
                  </div>
                </div>
                <div className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border/60 p-4 shadow-sm bg-muted/30">
                  <div className="flex h-5 items-center">
                    <input 
                      type="checkbox" 
                      id="assignMembership" 
                      name="assignMembership" 
                      value="true"
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="assignMembership">Enroll in Loyalty Program</Label>
                    <p className="text-[11px] text-muted-foreground">Assigns a Standard tier membership to this guest profile.</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Guest"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Guests", value: stats.total, icon: Users, color: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
          { label: "Active Members", value: stats.members, icon: CreditCard, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
          { label: "VIP Guests", value: stats.vips, icon: Star, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
          { label: "In-House Guests", value: stats.activeStays, icon: ShieldCheck, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="group rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className={`rounded-xl p-2 ${stat.color} transition-transform duration-300 group-hover:scale-110`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">{stat.value}</h2>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <Select value={filterMembership} onValueChange={(val) => setFilterMembership(val || "ALL")}>
            <SelectTrigger className="w-[180px] bg-background rounded-xl">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>{filterMembership === 'ALL' ? 'All Tiers' : filterMembership}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Tiers</SelectItem>
              <SelectItem value="STANDARD">Standard</SelectItem>
              <SelectItem value="GOLD">Gold</SelectItem>
              <SelectItem value="PLATINUM">Platinum</SelectItem>
              <SelectItem value="DIAMOND">Diamond</SelectItem>
              <SelectItem value="NONE">No Membership</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[11px] uppercase bg-muted/30 text-muted-foreground sticky top-0 z-10 border-b border-border/40">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Guest</th>
                <th className="px-6 py-3.5 font-semibold">Contact Info</th>
                <th className="px-6 py-3.5 font-semibold">Membership</th>
                <th className="px-6 py-3.5 font-semibold">Total Stays</th>
                <th className="px-6 py-3.5 font-semibold">Total Spend</th>
                <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center">
                      <Users className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">No guests found matching your criteria.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((guest: any) => {
                  const totalStays = guest.reservations.length
                  const totalSpend = guest.reservations.reduce((sum: number, r: any) => sum + r.totalAmount, 0)
                  
                  return (
                    <tr key={guest.id} className="hover:bg-muted/30 transition-colors duration-150">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-indigo-500/15 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold text-sm shrink-0">
                            {guest.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{guest.name}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">ID: {guest.id.substring(guest.id.length - 6)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="text-sm font-medium">{guest.phone}</div>
                        <div className="text-xs text-muted-foreground">{guest.email || '-'}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        {guest.membership ? (
                          <div className="flex flex-col gap-1 items-start">
                            {getTierBadge(guest.membership.tier)}
                            <span className="text-[10px] text-muted-foreground font-medium">{guest.membership.points} pts</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No membership</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="font-semibold">{totalStays}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">${totalSpend.toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem render={<Link href={`/guests/${guest.id}`} />}>
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem render={<div onClick={() => setEditGuest(guest)} />}>
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem render={<Link href={`/reservations?newBooking=true&guestId=${guest.id}`} />}>
                              New Reservation
                            </DropdownMenuItem>
                            <DropdownMenuItem render={<Link href={`/operations?newTicket=true&guestId=${guest.id}`} />}>
                              Create Ticket
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <Dialog open={!!editGuest} onOpenChange={(open) => !open && setEditGuest(null)}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <form key={editGuest?.id} onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle className="text-lg">Edit Guest</DialogTitle>
              <DialogDescription>Update details for {editGuest?.name}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Full Name *</Label>
                <Input id="edit-name" name="name" defaultValue={editGuest?.name} required className="rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone Number *</Label>
                <Input id="edit-phone" name="phone" type="tel" defaultValue={editGuest?.phone} required className="rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email Address</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={editGuest?.email || ''} className="rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-idType">ID Type</Label>
                  <Select name="idType" defaultValue={editGuest?.idType || 'PASSPORT'}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select ID" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PASSPORT">Passport</SelectItem>
                      <SelectItem value="DRIVERS_LICENSE">Driver&apos;s License</SelectItem>
                      <SelectItem value="NATIONAL_ID">National ID</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-idNumber">ID Number</Label>
                  <Input id="edit-idNumber" name="idNumber" defaultValue={editGuest?.idNumber || ''} className="rounded-xl" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <button
                type="submit"
                disabled={isEditSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
              >
                {isEditSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
