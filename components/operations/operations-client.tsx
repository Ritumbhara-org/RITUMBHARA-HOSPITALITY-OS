"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Search, Filter, Wrench, AlertCircle, Clock, CheckCircle2, MessageSquare, GripVertical, Plus } from "lucide-react"
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
    <Suspense fallback={<div>Loading operations...</div>}>
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
  
  // Pre-fill fields if provided in URL
  const [defaultGuestId, setDefaultGuestId] = useState<string | undefined>()

  useEffect(() => {
    if (searchParams.get("newTicket") === "true") {
      setIsDialogOpen(true)
      const guestId = searchParams.get("guestId")
      if (guestId) setDefaultGuestId(guestId)
      
      // Clear URL params
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
      case 'CRITICAL': return 'text-destructive bg-destructive/10'
      case 'HIGH': return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30'
      case 'MEDIUM': return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30'
      default: return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30'
    }
  }

  const renderTicketCard = (ticket: any) => (
    <div key={ticket.id} className="p-3 mb-3 bg-card border rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start mb-2">
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm ${getPriorityColor(ticket.priority)}`}>
          {ticket.priority}
        </span>
        <span className="text-[10px] text-muted-foreground">{ticket.id}</span>
      </div>
      <h4 className="font-semibold text-sm mb-1 line-clamp-1">{ticket.title || ticket.category}</h4>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{ticket.description}</p>
      
      <div className="flex items-center justify-between mt-auto pt-2 border-t text-xs">
        <div className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
          <Wrench className="h-3 w-3" />
          {ticket.unit?.name || 'Property'}
        </div>
        <div className="flex -space-x-1">
          {ticket.assignedTo ? (
            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold border border-background">
              {ticket.assignedTo.name.charAt(0)}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground italic">Unassigned</div>
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
    <div className="flex flex-col flex-1 h-full w-full gap-6 pb-4 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage housekeeping, maintenance, and guest requests.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" />
            Create Ticket
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Ticket</DialogTitle>
                <DialogDescription>
                  Add a new maintenance or housekeeping issue to the board.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="e.g., AC not working" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="unitId">Location / Unit</Label>
                    <Select name="unitId" defaultValue="property">
                      <SelectTrigger>
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
                      <SelectTrigger>
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
                      <SelectTrigger>
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
                    className="min-h-[100px]"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
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
          { label: "Total Tickets", value: stats.total, icon: Wrench },
          { label: "Open Issues", value: stats.open, icon: AlertCircle },
          { label: "In Progress", value: stats.inProgress, icon: Clock },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle2 }
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
            <div className="mt-2 flex items-baseline gap-2">
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
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewMode('board')}
              className={`p-1.5 rounded-sm transition-colors border shadow-sm ${viewMode === 'board' ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px] bg-background">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>Filter: {filterCategory === 'ALL' ? 'All Categories' : filterCategory.replace('_', ' ')}</span>
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

        <div className="flex-1 overflow-auto bg-slate-50/30 dark:bg-slate-900/20 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-w-[768px]">
            {/* TODO Column */}
            <div className="flex flex-col h-full rounded-lg bg-slate-100/50 dark:bg-slate-800/20 border border-slate-200/50 dark:border-slate-700/30">
              <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-lg">
                <h3 className="font-semibold text-sm">To Do <span className="ml-2 text-xs font-normal text-muted-foreground bg-background px-2 py-0.5 rounded-full border">{openTickets.length}</span></h3>
              </div>
              <div className="p-2 flex-1 overflow-y-auto">
                {openTickets.map(renderTicketCard)}
              </div>
            </div>

            {/* IN PROGRESS Column */}
            <div className="flex flex-col h-full rounded-lg bg-slate-100/50 dark:bg-slate-800/20 border border-slate-200/50 dark:border-slate-700/30">
              <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-lg">
                <h3 className="font-semibold text-sm">In Progress <span className="ml-2 text-xs font-normal text-muted-foreground bg-background px-2 py-0.5 rounded-full border">{inProgressTickets.length}</span></h3>
              </div>
              <div className="p-2 flex-1 overflow-y-auto">
                {inProgressTickets.map(renderTicketCard)}
              </div>
            </div>

            {/* RESOLVED Column */}
            <div className="flex flex-col h-full rounded-lg bg-slate-100/50 dark:bg-slate-800/20 border border-slate-200/50 dark:border-slate-700/30">
              <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-lg">
                <h3 className="font-semibold text-sm">Resolved <span className="ml-2 text-xs font-normal text-muted-foreground bg-background px-2 py-0.5 rounded-full border">{resolvedTickets.length}</span></h3>
              </div>
              <div className="p-2 flex-1 overflow-y-auto opacity-70">
                {resolvedTickets.map(renderTicketCard)}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
