"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Search, Filter, CalendarCheck, MoreHorizontal, CheckCircle2, Calendar, Clock, XCircle, Loader2, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { updateReservationStatus, createReservation } from "@/app/actions/reservations"
import Link from "next/link"
import { format } from "date-fns"

type ReservationStats = {
  total: number
  active: number
  upcoming: number
  cancelled: number
}

export function ReservationsClient({ 
  initialData, 
  stats,
  guests,
  units
}: { 
  initialData: any[],
  stats: ReservationStats,
  guests: { id: string, name: string, phone: string }[],
  units: { id: string, name: string, type: string }[]
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground">Loading reservations...</div>}>
      <ReservationsClientContent 
        initialData={initialData} 
        stats={stats} 
        guests={guests} 
        units={units} 
      />
    </Suspense>
  )
}

function ReservationsClientContent({ 
  initialData, 
  stats,
  guests,
  units
}: { 
  initialData: any[],
  stats: ReservationStats,
  guests: { id: string, name: string, phone: string }[],
  units: { id: string, name: string, type: string }[]
}) {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("ALL")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  
  const [defaultGuestId, setDefaultGuestId] = useState<string | undefined>()

  useEffect(() => {
    if (searchParams.get("newBooking") === "true") {
      setIsDialogOpen(true)
      const guestId = searchParams.get("guestId")
      if (guestId) setDefaultGuestId(guestId)
      router.replace("/reservations")
    }
  }, [searchParams, router])

  const handleStatusChange = async (reservationId: string, status: string, label: string) => {
    if (!confirm(`Are you sure you want to mark this reservation as "${label}"?`)) return
    setLoadingId(reservationId)
    const result = await updateReservationStatus(reservationId, status)
    setLoadingId(null)
    if (!result.success) alert("Failed to update: " + result.error)
  }

  const handleNewBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const result = await createReservation(formData)
    setIsSubmitting(false)
    if (result.success) {
      setIsDialogOpen(false)
    } else {
      alert("Failed to create booking: " + result.error)
    }
  }

  const filteredData = initialData.filter((res: any) => {
    const matchesSearch = res.guest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.unit?.name.toLowerCase().includes(searchTerm.toLowerCase())
    if (filterStatus === "ALL") return matchesSearch;
    return matchesSearch && res.status === filterStatus;
  })

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'CHECKED_IN':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20"><CheckCircle2 className="h-3 w-3" /> Checked In</span>
      case 'CONFIRMED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"><Clock className="h-3 w-3" /> Confirmed</span>
      case 'CHECKED_OUT':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20"><CheckCircle2 className="h-3 w-3" /> Checked Out</span>
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20"><XCircle className="h-3 w-3" /> Cancelled</span>
      default:
        return <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20">{status}</span>
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full gap-5 pb-4 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservations</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all property bookings and stays.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]">
            <Plus className="h-4 w-4" />
            New Booking
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px] rounded-2xl">
            <form onSubmit={handleNewBooking}>
              <DialogHeader>
                <DialogTitle className="text-lg">New Booking</DialogTitle>
                <DialogDescription>Create a new reservation for a guest.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="guestId">Guest *</Label>
                  <Select name="guestId" defaultValue={defaultGuestId} required>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select guest..." />
                    </SelectTrigger>
                    <SelectContent>
                      {guests.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name} — {g.phone}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="unitId">Unit / Room *</Label>
                  <Select name="unitId" required>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select unit..." />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name} — {u.type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="checkIn">Check-In *</Label>
                    <Input id="checkIn" name="checkIn" type="date" required className="rounded-xl" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="checkOut">Check-Out *</Label>
                    <Input id="checkOut" name="checkOut" type="date" required className="rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="source">Booking Source</Label>
                    <Select name="source" defaultValue="DIRECT">
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DIRECT">Direct</SelectItem>
                        <SelectItem value="OTA">OTA (Booking.com etc)</SelectItem>
                        <SelectItem value="PHONE">Phone</SelectItem>
                        <SelectItem value="WALK_IN">Walk-in</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="totalAmount">Total Amount (₹)</Label>
                    <Input id="totalAmount" name="totalAmount" type="number" min="0" step="0.01" placeholder="0.00" className="rounded-xl" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bookingNotes">Notes</Label>
                  <Textarea id="bookingNotes" name="bookingNotes" placeholder="Any special requests or notes..." className="min-h-[80px] rounded-xl" />
                </div>
              </div>
              <DialogFooter>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Create Booking"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Bookings", value: stats.total, icon: Calendar, color: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
          { label: "Active Stays", value: stats.active, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
          { label: "Upcoming", value: stats.upcoming, icon: Clock, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
          { label: "Cancelled", value: stats.cancelled, icon: XCircle, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" }
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
              placeholder="Search guests or units..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "ALL")}>
            <SelectTrigger className="w-[180px] bg-background rounded-xl">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>{filterStatus === 'ALL' ? 'All Status' : filterStatus.replace('_', ' ')}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="CHECKED_IN">Checked In</SelectItem>
              <SelectItem value="CHECKED_OUT">Checked Out</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[11px] uppercase bg-muted/30 text-muted-foreground sticky top-0 z-10 border-b border-border/40">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Guest</th>
                <th className="px-6 py-3.5 font-semibold">Unit</th>
                <th className="px-6 py-3.5 font-semibold">Stay Dates</th>
                <th className="px-6 py-3.5 font-semibold">Status</th>
                <th className="px-6 py-3.5 font-semibold">Amount</th>
                <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center">
                      <CalendarCheck className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">No reservations found matching your criteria.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((res: any) => (
                  <tr key={res.id} className="hover:bg-muted/30 transition-colors duration-150">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-indigo-500/15 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold text-sm">
                          {res.guest.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{res.guest.name}</div>
                          <div className="text-xs text-muted-foreground">{res.guest.email || res.guest.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-semibold">{res.unit?.name || 'Unassigned'}</div>
                      <div className="text-xs text-muted-foreground">{res.unit?.type || '-'}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-medium">{format(new Date(res.checkIn), "MMM d, yyyy")}</div>
                      <div className="text-xs text-muted-foreground">to {format(new Date(res.checkOut), "MMM d, yyyy")}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      {getStatusBadge(res.status)}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-semibold">${res.totalAmount.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{res.source}</div>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                          {loadingId === res.id 
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <MoreHorizontal className="h-4 w-4" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem render={<Link href={`/guests/${res.guest.id}`} />}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {res.status === 'ARRIVING' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CHECKED_IN', 'Checked In')} />}>
                              Check In Guest
                            </DropdownMenuItem>
                          )}
                          {res.status === 'CONFIRMED' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CHECKED_IN', 'Checked In')} />}>
                              Check In Guest
                            </DropdownMenuItem>
                          )}
                          {res.status === 'CHECKED_IN' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CHECKED_OUT', 'Checked Out')} />}>
                              Check Out Guest
                            </DropdownMenuItem>
                          )}
                          {res.status === 'PENDING' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CONFIRMED', 'Confirmed')} />}>
                              Confirm Booking
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            render={<div onClick={() => handleStatusChange(res.id, 'CANCELLED', 'Cancelled')} />}
                          >
                            Cancel Reservation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
