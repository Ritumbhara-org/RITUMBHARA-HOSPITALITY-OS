"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Search, Filter, CalendarCheck, CalendarDays, MoreHorizontal, User, Key, CheckCircle2, Calendar, ArrowUpRight, Clock, XCircle, Loader2, Plus } from "lucide-react"
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
    <Suspense fallback={<div>Loading reservations...</div>}>
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
  
  // Pre-fill guestId if provided in URL
  const [defaultGuestId, setDefaultGuestId] = useState<string | undefined>()

  useEffect(() => {
    if (searchParams.get("newBooking") === "true") {
      setIsDialogOpen(true)
      const guestId = searchParams.get("guestId")
      if (guestId) setDefaultGuestId(guestId)
      
      // Clear URL params so refresh doesn't reopen it
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
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-400/20"><CheckCircle2 className="h-3 w-3" /> Checked In</span>
      case 'CONFIRMED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-400/20"><Clock className="h-3 w-3" /> Confirmed</span>
      case 'CHECKED_OUT':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-400/20"><CheckCircle2 className="h-3 w-3" /> Checked Out</span>
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-900/30 dark:text-rose-400 dark:ring-rose-400/20"><XCircle className="h-3 w-3" /> Cancelled</span>
      default:
        return <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-400/20">{status}</span>
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full gap-6 pb-4 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reservations</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all property bookings and stays.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <form onSubmit={handleNewBooking}>
              <DialogHeader>
                <DialogTitle>New Booking</DialogTitle>
                <DialogDescription>Create a new reservation for a guest.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="guestId">Guest *</Label>
                  <Select name="guestId" defaultValue={defaultGuestId} required>
                    <SelectTrigger>
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
                    <SelectTrigger>
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
                    <Input id="checkIn" name="checkIn" type="date" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="checkOut">Check-Out *</Label>
                    <Input id="checkOut" name="checkOut" type="date" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="source">Booking Source</Label>
                    <Select name="source" defaultValue="DIRECT">
                      <SelectTrigger>
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
                    <Input id="totalAmount" name="totalAmount" type="number" min="0" step="0.01" placeholder="0.00" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bookingNotes">Notes</Label>
                  <Textarea id="bookingNotes" name="bookingNotes" placeholder="Any special requests or notes..." className="min-h-[80px]" />
                </div>
              </div>
              <DialogFooter>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
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
          { label: "Total Bookings", value: stats.total, icon: Calendar },
          { label: "Active Stays", value: stats.active, icon: CheckCircle2 },
          { label: "Upcoming", value: stats.upcoming, icon: Clock },
          { label: "Cancelled", value: stats.cancelled, icon: XCircle }
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
              placeholder="Search guests or units..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px] bg-background">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>Filter: {filterStatus === 'ALL' ? 'All Status' : filterStatus.replace('_', ' ')}</span>
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

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900 text-slate-500 sticky top-0 z-10 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold">Guest</th>
                <th className="px-6 py-4 font-semibold">Unit</th>
                <th className="px-6 py-4 font-semibold">Stay Dates</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No reservations found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredData.map((res: any) => (
                  <tr key={res.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                          {res.guest.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{res.guest.name}</div>
                          <div className="text-xs text-muted-foreground">{res.guest.email || res.guest.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{res.unit?.name || 'Unassigned'}</div>
                      <div className="text-xs text-muted-foreground">{res.unit?.type || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{format(new Date(res.checkIn), "MMM d, yyyy")}</div>
                      <div className="text-xs text-muted-foreground">to {format(new Date(res.checkOut), "MMM d, yyyy")}</div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(res.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">${res.totalAmount.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{res.source}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                          {loadingId === res.id 
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <MoreHorizontal className="h-4 w-4" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/guests/${res.guest.id}`} />}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {res.status === 'ARRIVING' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CHECKED_IN', 'Checked In')} />}>
                              ✓ Check In Guest
                            </DropdownMenuItem>
                          )}
                          {res.status === 'CONFIRMED' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CHECKED_IN', 'Checked In')} />}>
                              ✓ Check In Guest
                            </DropdownMenuItem>
                          )}
                          {res.status === 'CHECKED_IN' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CHECKED_OUT', 'Checked Out')} />}>
                              ✓ Check Out Guest
                            </DropdownMenuItem>
                          )}
                          {res.status === 'PENDING' && (
                            <DropdownMenuItem render={<div onClick={() => handleStatusChange(res.id, 'CONFIRMED', 'Confirmed')} />}>
                              ✓ Confirm Booking
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            render={<div onClick={() => handleStatusChange(res.id, 'CANCELLED', 'Cancelled')} />}
                          >
                            ✕ Cancel Reservation
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
