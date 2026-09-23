"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Search, Filter, Wrench, AlertCircle, Clock, CheckCircle2, GripVertical, Plus, ChevronDown, ListFilter } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createTicket } from "@/app/actions/operations"

import { TicketDetailsModal } from "./ticket-details-modal"

type OperationStats = {
  total: number
  open: number
  inProgress: number
  resolved: number
}

export function OperationsClient({ 
  initialData, 
  stats,
  properties,
  units,
  teamMembers
}: { 
  initialData: any[],
  stats: OperationStats,
  properties: { id: string, name: string }[],
  units: { id: string, name: string, propertyId: string }[],
  teamMembers: any[]
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground">Loading operations...</div>}>
      <OperationsClientContent initialData={initialData} stats={stats} properties={properties} units={units} teamMembers={teamMembers} />
    </Suspense>
  )
}

function OperationsClientContent({ 
  initialData, 
  stats,
  properties,
  units,
  teamMembers
}: { 
  initialData: any[],
  stats: OperationStats,
  properties: { id: string, name: string }[],
  units: { id: string, name: string, propertyId: string }[],
  teamMembers: any[]
}) {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategory, setFilterCategory] = useState("ALL")
  const [filterProperty, setFilterProperty] = useState("ALL")
  const [filterUnit, setFilterUnit] = useState("ALL")
  const [filterPriority, setFilterPriority] = useState("ALL")
  const [filterAssignee, setFilterAssignee] = useState("ALL")
  const [filterReporter, setFilterReporter] = useState("ALL")
  const [filterStatus, setFilterStatus] = useState("ALL")
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null)

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
    // Search
    const matchesSearch = ticket.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.unit?.name.toLowerCase().includes(searchTerm.toLowerCase())
    if (!matchesSearch) return false;

    // Filters
    if (filterCategory !== "ALL" && ticket.category !== filterCategory) return false;
    if (filterProperty !== "ALL" && ticket.propertyId !== filterProperty) return false;
    if (filterUnit !== "ALL" && ticket.unitId !== filterUnit) return false;
    if (filterPriority !== "ALL" && ticket.priority !== filterPriority) return false;
    if (filterAssignee !== "ALL") {
      if (filterAssignee === "UNASSIGNED" && ticket.assignedToId !== null) return false;
      if (filterAssignee !== "UNASSIGNED" && ticket.assignedToId !== filterAssignee) return false;
    }
    if (filterReporter !== "ALL" && ticket.reporterType !== filterReporter) return false;
    if (filterStatus !== "ALL") {
      if (filterStatus === "OPEN" && !['OPEN', 'TRIAGED'].includes(ticket.status)) return false;
      if (filterStatus === "ASSIGNED" && ticket.status !== 'ASSIGNED') return false;
      if (filterStatus === "IN_PROGRESS" && !['ACKNOWLEDGED', 'IN_PROGRESS'].includes(ticket.status)) return false;
      if (filterStatus === "RESOLVED" && !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(ticket.status)) return false;
    }
    
    // Overdue Filter
    const isOverdue = ticket.slaDeadline && new Date(ticket.slaDeadline) < new Date() && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && ticket.status !== 'VERIFIED';
    if (filterOverdue && !isOverdue) return false;

    return true;
  })

  // Groupings for Kanban
  const openTickets = filteredData.filter((t: any) => t.status === 'OPEN' || t.status === 'TRIAGED')
  const inProgressTickets = filteredData.filter((t: any) => t.status === 'ASSIGNED' || t.status === 'ACKNOWLEDGED' || t.status === 'IN_PROGRESS')
  const resolvedTickets = filteredData.filter((t: any) => t.status === 'RESOLVED' || t.status === 'VERIFIED' || t.status === 'CLOSED')

  // Top-level stats calculation based on ALL initial data (not filtered, so user always sees the big picture)
  const statsOpen = initialData.filter(t => t.status === 'OPEN' || t.status === 'TRIAGED').length;
  const statsAssigned = initialData.filter(t => t.status === 'ASSIGNED').length;
  const statsInProgress = initialData.filter(t => t.status === 'ACKNOWLEDGED' || t.status === 'IN_PROGRESS').length;
  const statsOverdue = initialData.filter(t => t.slaDeadline && new Date(t.slaDeadline) < new Date() && !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(t.status)).length;
  const statsCritical = initialData.filter(t => t.priority === 'CRITICAL').length;
  const statsResolved = initialData.filter(t => ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(t.status)).length;

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'CRITICAL': return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
      case 'HIGH': return 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-500/10'
      case 'MEDIUM': return 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10'
      default: return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10'
    }
  }

  const renderTicketCard = (ticket: any) => {
    const isOverdue = ticket.slaDeadline && new Date(ticket.slaDeadline) < new Date() && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && ticket.status !== 'VERIFIED';
    
    return (
    <div 
      key={ticket.id} 
      onClick={() => setSelectedTicket(ticket)}
      className={`p-3.5 mb-2.5 bg-card border rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 group ${isOverdue ? 'border-red-500/50 hover:border-red-500/80' : 'border-border/60 hover:border-border'}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex gap-2 items-center">
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-lg ${getPriorityColor(ticket.priority)}`}>
            {ticket.priority}
          </span>
          {isOverdue && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
              OVERDUE
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">#{ticket.id.substring(ticket.id.length - 4)}</span>
      </div>
      <h4 className="font-semibold text-sm mb-1 line-clamp-1">{ticket.title || ticket.category}</h4>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{ticket.description}</p>
      
      <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-border/40 text-xs">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" />
            {ticket.unit?.name || 'Property'}
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            By: {
              ticket.reporterType === 'GUEST' 
                ? (ticket.guest?.name || 'Guest') 
                : ticket.reporterType === 'TEAM' 
                  ? (() => {
                      const reporter = teamMembers.find(m => m.id === ticket.reporterId);
                      return reporter ? `${reporter.name} (${reporter.department})` : 'Staff';
                    })()
                  : 'Management'
            }
          </div>
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
  )};

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
    <div className="flex flex-col h-[calc(100vh-100px)] w-full gap-5 pb-4">
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
                    <Label htmlFor="assigneeId">Assign To (Optional)</Label>
                    <Select name="assigneeId" defaultValue="unassigned">
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select Assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name} ({member.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                </div>
                <div className="grid grid-cols-2 gap-4">
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

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Open Issues", value: statsOpen, icon: AlertCircle, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
          { label: "Assigned", value: statsAssigned, icon: Wrench, color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
          { label: "In Progress", value: statsInProgress, icon: Clock, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
          { label: "Overdue", value: statsOverdue, icon: AlertCircle, color: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400", urgent: true },
          { label: "Critical", value: statsCritical, icon: AlertCircle, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", urgent: true },
          { label: "Resolved", value: statsResolved, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className={`group rounded-2xl border p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80 ${stat.urgent && stat.value > 0 ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-card'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`text-sm font-medium ${stat.urgent && stat.value > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{stat.label}</p>
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
            <Popover>
              <PopoverTrigger className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                <ListFilter className="h-4 w-4" />
                Advanced Filters
                {([filterCategory, filterProperty, filterUnit, filterPriority, filterAssignee, filterReporter, filterStatus].filter(v => v !== "ALL").length > 0 || filterOverdue) && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {[filterCategory, filterProperty, filterUnit, filterPriority, filterAssignee, filterReporter, filterStatus].filter(v => v !== "ALL").length + (filterOverdue ? 1 : 0)}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent className="w-80 rounded-2xl p-4" align="end">
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm">Filter Tickets</h4>
                  
                  <div className="grid gap-2">
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select value={filterCategory} onValueChange={(val) => setFilterCategory(val || "ALL")}>
                      <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="All Categories" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Categories</SelectItem>
                        <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                        <SelectItem value="HOUSEKEEPING">Housekeeping</SelectItem>
                        <SelectItem value="GUEST_REQUEST">Guest Request</SelectItem>
                        <SelectItem value="COMPLAINT">Complaint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs text-muted-foreground">Property</Label>
                    <Select value={filterProperty} onValueChange={(val) => { setFilterProperty(val || "ALL"); setFilterUnit("ALL"); }}>
                      <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="All Properties" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Properties</SelectItem>
                        {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {filterProperty !== "ALL" && (
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">Unit</Label>
                      <Select value={filterUnit} onValueChange={(val) => setFilterUnit(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="All Units" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Units</SelectItem>
                          {units.filter(u => u.propertyId === filterProperty).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">Priority</Label>
                      <Select value={filterPriority} onValueChange={(val) => setFilterPriority(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All</SelectItem>
                          <SelectItem value="CRITICAL">Critical</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="LOW">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">Assignee</Label>
                      <Select value={filterAssignee} onValueChange={(val) => setFilterAssignee(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Staff</SelectItem>
                          <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                          {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">Reporter</Label>
                      <Select value={filterReporter} onValueChange={(val) => setFilterReporter(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Reporters</SelectItem>
                          <SelectItem value="GUEST">Guest</SelectItem>
                          <SelectItem value="TEAM">Team</SelectItem>
                          <SelectItem value="MANAGEMENT">Management</SelectItem>
                          <SelectItem value="SYSTEM">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Status</SelectItem>
                          <SelectItem value="OPEN">Open</SelectItem>
                          <SelectItem value="ASSIGNED">Assigned</SelectItem>
                          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                          <SelectItem value="RESOLVED">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-2 border-t">
                    <input 
                      type="checkbox" 
                      id="overdue-toggle" 
                      checked={filterOverdue}
                      onChange={(e) => setFilterOverdue(e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <label htmlFor="overdue-toggle" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Show Overdue Only
                    </label>
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={() => {
                        setFilterCategory("ALL"); setFilterProperty("ALL"); setFilterUnit("ALL");
                        setFilterPriority("ALL"); setFilterAssignee("ALL"); setFilterReporter("ALL"); setFilterStatus("ALL"); setFilterOverdue(false);
                      }}
                      className="w-full text-xs text-center py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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

      <TicketDetailsModal 
        ticket={selectedTicket} 
        isOpen={!!selectedTicket} 
        onClose={() => setSelectedTicket(null)} 
        teamMembers={teamMembers} 
      />
    </div>
  )
}
