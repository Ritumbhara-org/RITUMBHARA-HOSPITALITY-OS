"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Search, Filter, Wrench, AlertCircle, Clock, CheckCircle2, GripVertical, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createTicket } from "@/app/actions/operations"

type OperationStats = {
  total: number
  open: number
  inProgress: number
  resolved: number
}

export function OperationsClient({ 
  initialData, 
  stats,
  units 
}: { 
  initialData: any[],
  stats: OperationStats,
  units: { id: string, name: string }[]
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground">Loading operations...</div>}>
      <OperationsClientContent initialData={initialData} stats={stats} units={units} />
    </Suspense>
  )
}

function OperationsClientContent({ 
  initialData, 
  stats,
  units 
}: { 
  initialData: any[],
  stats: OperationStats,
  units: { id: string, name: string }[]
}) {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategory, setFilterCategory] = useState("ALL")
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  
  const [defaultGuestId, setDefaultGuestId] = useState<string | undefined>()

  useEffect(() => {
    if (searchParams.get("newTicket") === "true") {
      setIsDialogOpen(true)
      const guestId = searchParams.get("guestId")
      if (guestId) setDefaultGuestId(guestId)
      router.replace("/operations")
    }
  }, [searchParams, router])

  const filteredData = initialData.filter((ticket: any) => {
    const matchesSearch = ticket.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.unit?.name.toLowerCase().includes(searchTerm.toLowerCase())
    if (filterCategory === "ALL") return matchesSearch;
    return matchesSearch && ticket.category === filterCategory;
  })

  const openTickets = filteredData.filter((t: any) => t.status === 'OPEN' || t.status === 'TRIAGED')
  const inProgressTickets = filteredData.filter((t: any) => t.status === 'ASSIGNED' || t.status === 'ACKNOWLEDGED' || t.status === 'IN_PROGRESS')
  const resolvedTickets = filteredData.filter((t: any) => t.status === 'RESOLVED' || t.status === 'VERIFIED' || t.status === 'CLOSED')

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'CRITICAL': return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
      case 'HIGH': return 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-500/10'
      case 'MEDIUM': return 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10'
      default: return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10'
    }
  }

  const renderTicketCard = (ticket: any) => (
    <div key={ticket.id} className="p-3.5 mb-2.5 bg-card border border-border/60 rounded-xl shadow-sm cursor-pointer hover:shadow-md hover:border-border transition-all duration-200 group">
      <div className="flex justify-between items-start mb-2">
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-lg ${getPriorityColor(ticket.priority)}`}>
          {ticket.priority}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">#{ticket.id.substring(ticket.id.length - 4)}</span>
      </div>
      <h4 className="font-semibold text-sm mb-1 line-clamp-1">{ticket.title || ticket.category}</h4>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{ticket.description}</p>
      
      <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-border/40 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Wrench className="h-3 w-3" />
          {ticket.unit?.name || 'Property'}
        </div>
        <div className="flex -space-x-1">
          {ticket.assignedTo ? (
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-rose-500/20 to-red-500/20 flex items-center justify-center text-[10px] font-bold border-2 border-background text-rose-600 dark:text-rose-400">
              {ticket.assignedTo.name.charAt(0)}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
          )}
        </div>
      </div>
    </div>
  )

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const result = await createTicket(formData)
    setIsSubmitting(false)
    if (result.success) {
      setIsDialogOpen(false)
    } else {
      alert("Failed to create ticket: " + result.error)
    }
  }

  return (
    <div className="flex flex-col flex-1 w-full gap-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage housekeeping, maintenance, and guest requests.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]">
            <Plus className="h-4 w-4" />
            Create Ticket
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle className="text-lg">Create Ticket</DialogTitle>
                <DialogDescription>Add a new maintenance or housekeeping issue to the board.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="e.g., AC not working" required className="rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="unitId">Location / Unit</Label>
                    <Select name="unitId" defaultValue="property">
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="property">Property-wide</SelectItem>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Select name="category" defaultValue="MAINTENANCE">
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                        <SelectItem value="HOUSEKEEPING">Housekeeping</SelectItem>
                        <SelectItem value="GUEST_REQUEST">Guest Request</SelectItem>
                        <SelectItem value="COMPLAINT">Complaint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select name="priority" defaultValue="MEDIUM">
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    name="description" 
                    placeholder="Details about the issue..." 
                    className="min-h-[100px] rounded-xl"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Ticket"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Tickets", value: stats.total, icon: Wrench, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
          { label: "Open Issues", value: stats.open, icon: AlertCircle, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
          { label: "In Progress", value: stats.inProgress, icon: Clock, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" }
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
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewMode('board')}
              className={`p-2 rounded-xl transition-all duration-200 border shadow-sm ${viewMode === 'board' ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:text-foreground border-border/60'}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Select value={filterCategory} onValueChange={(val) => setFilterCategory(val || "ALL")}>
              <SelectTrigger className="w-[180px] bg-background rounded-xl">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>{filterCategory === 'ALL' ? 'All Categories' : filterCategory.replace('_', ' ')}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="HOUSEKEEPING">Housekeeping</SelectItem>
                <SelectItem value="GUEST_REQUEST">Guest Request</SelectItem>
                <SelectItem value="COMPLAINT">Complaint</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-muted/10 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-full min-w-[768px]">
            <div className="flex flex-col h-full rounded-2xl bg-muted/30 border border-border/40">
              <div className="p-3.5 border-b border-border/40 flex items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <h3 className="font-semibold text-sm">To Do</h3>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-2.5 py-1 rounded-lg border border-border/40">{openTickets.length}</span>
              </div>
              <div className="p-2.5 flex-1 overflow-y-auto">
                {openTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">No open tickets</div>
                ) : openTickets.map(renderTicketCard)}
              </div>
            </div>

            <div className="flex flex-col h-full rounded-2xl bg-muted/30 border border-border/40">
              <div className="p-3.5 border-b border-border/40 flex items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <h3 className="font-semibold text-sm">In Progress</h3>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-2.5 py-1 rounded-lg border border-border/40">{inProgressTickets.length}</span>
              </div>
              <div className="p-2.5 flex-1 overflow-y-auto">
                {inProgressTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">No tickets in progress</div>
                ) : inProgressTickets.map(renderTicketCard)}
              </div>
            </div>

            <div className="flex flex-col h-full rounded-2xl bg-muted/30 border border-border/40">
              <div className="p-3.5 border-b border-border/40 flex items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <h3 className="font-semibold text-sm">Resolved</h3>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-2.5 py-1 rounded-lg border border-border/40">{resolvedTickets.length}</span>
              </div>
              <div className="p-2.5 flex-1 overflow-y-auto opacity-75">
                {resolvedTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">No resolved tickets</div>
                ) : resolvedTickets.map(renderTicketCard)}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
