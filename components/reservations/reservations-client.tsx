"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
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
import { toast } from "sonner"
import { useTr } from "@/components/i18n/language-provider"

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
  units,
  currentPage = 1,
  totalPages = 1
}: { 
  initialData: any[],
  stats: ReservationStats,
  guests: { id: string, name: string, phone: string }[],
  units: { id: string, name: string, type: string }[],
  currentPage?: number,
  totalPages?: number
}) {
  const tr = useTr()
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground">{tr("Loading reservations...")}</div>}>
      <ReservationsClientContent 
        initialData={initialData} 
        stats={stats} 
        guests={guests} 
        units={units}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </Suspense>
  )
}

function ReservationsClientContent({ 
  initialData, 
  stats,
  guests,
  units,
  currentPage,
  totalPages
}: { 
  initialData: any[],
  stats: ReservationStats,
  guests: { id: string, name: string, phone: string }[],
  units: { id: string, name: string, type: string }[],
  currentPage: number,
  totalPages: number
}) {
  const tr = useTr()
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("ALL")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
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
    // We will use standard confirmed dialog for now, or just let it update smoothly
    setLoadingId(reservationId)
    const result = await updateReservationStatus(reservationId, status)
    setLoadingId(null)
    
    if (!result.success) {
      toast.error(tr("Failed to mark as {status}", { status: tr(label) }), { description: result.error })
    } else {
      let title = tr("Reservation marked as {status}", { status: tr(label) });
      let desc = "";
      
      if (status === 'CONFIRMED') {
        title = "Booking Confirmed! 🎉";
        desc = "The guest has been notified via WhatsApp.";
      } else if (status === 'CHECKED_IN') {
        title = "Guest Checked In 🏨";
        desc = "Welcome instructions sent via WhatsApp.";
      } else if (status === 'CHECKED_OUT') {
        title = "Guest Checked Out 🚪";
        desc = "Housekeeping task generated and sent to staff via WhatsApp.";
      }
      
      toast.success(title, { description: desc })
    }
  }

  const handleNewBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const result = await createReservation(formData)
    setIsSubmitting(false)
    if (result.success) {
      setIsDialogOpen(false)
      toast.success(tr("Booking Created 🗓️"), { 
        description: tr("The reservation has been added and the guest will be notified.") 
      })
    } else {
      toast.error(tr("Failed to create booking"), { description: result.error })
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
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20"><CheckCircle2 className="h-3 w-3" /> {tr("Checked In")}</span>
      case 'CONFIRMED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"><Clock className="h-3 w-3" /> {tr("Confirmed")}</span>
      case 'CHECKED_OUT':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20"><CheckCircle2 className="h-3 w-3" /> {tr("Checked Out")}</span>
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20"><XCircle className="h-3 w-3" /> {tr("Cancelled")}</span>
      default:
        return <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20">{tr(status)}</span>
    }
  }

  type ReservationRow = (typeof initialData)[number]

  const renderActions = (res: ReservationRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={tr("Booking actions")} className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
        {loadingId === res.id 
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <MoreHorizontal className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => router.push(`/guests/${res.guest.id}`)}>
          {tr("View Details")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {res.status === 'ARRIVING' && (
          <DropdownMenuItem onClick={() => handleStatusChange(res.id, 'CHECKED_IN', 'Checked In')}>
            {tr("Check In Guest")}
          </DropdownMenuItem>
        )}
        {res.status === 'CONFIRMED' && (
          <DropdownMenuItem onClick={() => handleStatusChange(res.id, 'CHECKED_IN', 'Checked In')}>
            {tr("Check In Guest")}
          </DropdownMenuItem>
        )}
        {res.status === 'CHECKED_IN' && (
          <DropdownMenuItem onClick={() => handleStatusChange(res.id, 'CHECKED_OUT', 'Checked Out')}>
            {tr("Check Out Guest")}
          </DropdownMenuItem>
        )}
        {res.status === 'PENDING' && (
          <DropdownMenuItem onClick={() => handleStatusChange(res.id, 'CONFIRMED', 'Confirmed')}>
            {tr("Confirm Booking")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="text-destructive focus:text-destructive"
          onClick={() => handleStatusChange(res.id, 'CANCELLED', 'Cancelled')}
        >
          {tr("Cancel Reservation")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex flex-col flex-1 w-full gap-4 sm:gap-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{tr("Reservations")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tr("Manage all property bookings and stays.")}</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]">
            <Plus className="h-4 w-4" />
            {tr("New Booking")}
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px] sm:rounded-2xl">
            <form onSubmit={handleNewBooking}>
              <DialogHeader>
                <DialogTitle className="text-lg">{tr("New Booking")}</DialogTitle>
                <DialogDescription>{tr("Create a new reservation for a guest.")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="guestId">{tr("Guest *")}</Label>
                  <Select name="guestId" defaultValue={defaultGuestId} required>
                    <SelectTrigger className="w-full rounded-xl">
                      <SelectValue placeholder={tr("Select guest...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {guests.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name} — {g.phone}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="unitId">{tr("Unit / Room *")}</Label>
                  <Select name="unitId" required>
                    <SelectTrigger className="w-full rounded-xl">
                      <SelectValue placeholder={tr("Select unit...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name} — {u.type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="checkIn">{tr("Check-In *")}</Label>
                    <Input id="checkIn" name="checkIn" type="date" required className="rounded-xl" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="checkOut">{tr("Check-Out *")}</Label>
                    <Input id="checkOut" name="checkOut" type="date" required className="rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="source">{tr("Booking Source")}</Label>
                    <Select name="source" defaultValue="DIRECT">
                      <SelectTrigger className="w-full rounded-xl">
                        <SelectValue placeholder={tr("Source")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DIRECT">{tr("Direct")}</SelectItem>
                        <SelectItem value="OTA">{tr("OTA (Booking.com etc)")}</SelectItem>
                        <SelectItem value="PHONE">{tr("Phone")}</SelectItem>
                        <SelectItem value="WALK_IN">{tr("Walk-in")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="totalAmount">{tr("Total Amount (₹)")}</Label>
                    <Input id="totalAmount" name="totalAmount" type="number" min="0" step="0.01" placeholder="0.00" className="rounded-xl" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bookingNotes">{tr("Notes")}</Label>
                  <Textarea id="bookingNotes" name="bookingNotes" placeholder={tr("Any special requests or notes...")} className="min-h-[80px] rounded-xl" />
                </div>
              </div>
              <DialogFooter>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? tr("Saving...") : tr("Create Booking")}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Bookings", value: stats.total, icon: Calendar, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
          { label: "Active Stays", value: stats.active, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
          { label: "Upcoming", value: stats.upcoming, icon: Clock, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
          { label: "Cancelled", value: stats.cancelled, icon: XCircle, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" }
        ].map((stat, i) => (
          <motion.div
            key={tr(stat.label)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="group rounded-2xl border bg-card min-w-0 p-3 sm:p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-3">
              <p className="text-xs sm:text-sm leading-snug font-medium text-muted-foreground">{tr(stat.label)}</p>
              <div className={`shrink-0 rounded-xl p-1.5 sm:p-2 ${stat.color} transition-transform duration-300 group-hover:scale-110`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">{stat.value}</h2>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-3 sm:p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tr("Search guests or units...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "ALL")}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background rounded-xl">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>{filterStatus === 'ALL' ? tr("All Status") : filterStatus.replace('_', ' ')}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{tr("All Status")}</SelectItem>
              <SelectItem value="CONFIRMED">{tr("Confirmed")}</SelectItem>
              <SelectItem value="CHECKED_IN">{tr("Checked In")}</SelectItem>
              <SelectItem value="CHECKED_OUT">{tr("Checked Out")}</SelectItem>
              <SelectItem value="CANCELLED">{tr("Cancelled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Phone: one card per booking. */}
        <ul className="divide-y divide-border/40 md:hidden">
          {filteredData.length === 0 ? (
            <li className="px-4 py-14 text-center text-muted-foreground">
              <CalendarCheck className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">{tr("No reservations found matching your criteria.")}</p>
            </li>
          ) : (
            filteredData.map((res: ReservationRow) => (
              <li key={res.id} className="flex gap-3 px-4 py-3.5">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-rose-500/15 to-red-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold text-sm">
                  {res.guest.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{res.guest.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{res.unit?.name || tr("Unassigned")}{res.unit?.type ? ` · ${res.unit.type}` : ''}</p>
                    </div>
                    <div className="-mr-2 -mt-1 shrink-0">{renderActions(res)}</div>
                  </div>
                  <p className="mt-1.5 text-[13px] text-foreground/80">
                    {format(new Date(res.checkIn), "d MMM")} → {format(new Date(res.checkOut), "d MMM yyyy")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {getStatusBadge(res.status)}
                    <span className="text-sm font-semibold tabular-nums">₹{res.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{res.source}</span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="flex-1 overflow-x-auto">
          <table className="hidden md:table w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[11px] uppercase bg-muted/30 text-muted-foreground sticky top-0 z-10 border-b border-border/40">
              <tr>
                <th className="px-6 py-3.5 font-semibold">{tr("Guest")}</th>
                <th className="px-6 py-3.5 font-semibold">{tr("Unit")}</th>
                <th className="px-6 py-3.5 font-semibold">{tr("Stay Dates")}</th>
                <th className="px-6 py-3.5 font-semibold">{tr("Status")}</th>
                <th className="px-6 py-3.5 font-semibold">{tr("Amount")}</th>
                <th className="px-6 py-3.5 font-semibold text-right">{tr("Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center">
                      <CalendarCheck className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">{tr("No reservations found matching your criteria.")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((res: any) => (
                  <tr key={res.id} className="hover:bg-muted/30 transition-colors duration-150">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500/15 to-red-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold text-sm">
                          {res.guest.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{res.guest.name}</div>
                          <div className="text-xs text-muted-foreground">{res.guest.email || res.guest.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-semibold">{res.unit?.name || tr("Unassigned")}</div>
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
                      <div className="font-semibold">₹{res.totalAmount.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{res.source}</div>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {renderActions(res)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-border/40">
              <div className="text-sm text-muted-foreground">
                {tr("Page {page} of {total}", { page: currentPage, total: totalPages })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`${pathname}?page=${currentPage > 1 ? currentPage - 1 : 1}`)}
                  disabled={currentPage <= 1}
                  className="h-10 px-4 text-sm font-medium rounded-xl border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {tr("Previous")}
                </button>
                <button
                  onClick={() => router.push(`${pathname}?page=${currentPage < totalPages ? currentPage + 1 : totalPages}`)}
                  disabled={currentPage >= totalPages}
                  className="h-10 px-4 text-sm font-medium rounded-xl border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {tr("Next")}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
