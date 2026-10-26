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
import { toast } from "sonner"

import { TicketDetailsModal } from "./ticket-details-modal"
import { useTr } from "@/components/i18n/language-provider"

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
  const tr = useTr()
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground">{tr("Loading operations...")}</div>}>
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
  const tr = useTr()
  const [searchTerm, setSearchTerm] = useState("")
  // Phone: the board shows one column at a time, picked with the tabs above it.
  const [mobileColumn, setMobileColumn] = useState<"open" | "progress" | "resolved">("open")
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
      className={`p-3.5 mb-2.5 sm:mb-0 lg:mb-2.5 bg-card border rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 group ${isOverdue ? 'border-red-500/50 hover:border-red-500/80' : 'border-border/60 hover:border-border'}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex gap-2 items-center">
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-lg ${getPriorityColor(ticket.priority)}`}>
            {tr(ticket.priority)}
          </span>
          {isOverdue && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
              {tr("OVERDUE")}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">#{ticket.id.substring(ticket.id.length - 4)}</span>
      </div>
      <h4 className="font-semibold text-sm mb-1 line-clamp-1">{ticket.title || tr(ticket.category.replace('_', ' '))}</h4>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{ticket.description}</p>
      
      <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-border/40 text-xs">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" />
            {ticket.unit?.name || tr("Property")}
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            {tr("By:")} {
              ticket.reporterType === 'GUEST' 
                ? (ticket.guest?.name || tr("Guest")) 
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
            <span className="text-[10px] text-muted-foreground italic">{tr("Unassigned")}</span>
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
      toast.success(tr("Ticket Created 🛠️"), { description: tr("The team has been notified.") })
    } else {
      toast.error(tr("Failed to create ticket"), { description: result.error })
    }
  }

  return (
    <div className="flex flex-col w-full gap-4 sm:gap-5 pb-4 lg:h-[calc(100dvh-100px)]">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{tr("Operations Hub")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tr("Manage housekeeping, maintenance, and guest requests.")}</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]">
            <Plus className="h-4 w-4" />
            {tr("Create Ticket")}
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] sm:rounded-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle className="text-lg">{tr("Create Ticket")}</DialogTitle>
                <DialogDescription>{tr("Add a new maintenance or housekeeping issue to the board.")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">{tr("Title")}</Label>
                  <Input id="title" name="title" placeholder={tr("e.g., AC not working")} required className="rounded-xl" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="assigneeId">{tr("Assign To (Optional)")}</Label>
                    <Select name="assigneeId" defaultValue="unassigned">
                      <SelectTrigger className="w-full rounded-xl">
                        <SelectValue placeholder={tr("Select Assignee")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">{tr("Unassigned")}</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name} ({member.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="unitId">{tr("Location / Unit")}</Label>
                    <Select name="unitId" defaultValue="property">
                      <SelectTrigger className="w-full rounded-xl">
                        <SelectValue placeholder={tr("Select Location")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="property">{tr("Property-wide")}</SelectItem>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="category">{tr("Category")}</Label>
                    <Select name="category" defaultValue="MAINTENANCE">
                      <SelectTrigger className="w-full rounded-xl">
                        <SelectValue placeholder={tr("Category")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAINTENANCE">{tr("Maintenance")}</SelectItem>
                        <SelectItem value="HOUSEKEEPING">{tr("Housekeeping")}</SelectItem>
                        <SelectItem value="GUEST_REQUEST">{tr("Guest Request")}</SelectItem>
                        <SelectItem value="COMPLAINT">{tr("Complaint")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="priority">{tr("Priority")}</Label>
                    <Select name="priority" defaultValue="MEDIUM">
                      <SelectTrigger className="w-full rounded-xl">
                        <SelectValue placeholder={tr("Priority")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">{tr("Low")}</SelectItem>
                        <SelectItem value="MEDIUM">{tr("Medium")}</SelectItem>
                        <SelectItem value="HIGH">{tr("High")}</SelectItem>
                        <SelectItem value="CRITICAL">{tr("Critical")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">{tr("Description")}</Label>
                  <Textarea 
                    id="description" 
                    name="description" 
                    placeholder={tr("Details about the issue...")} 
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
                  {isSubmitting ? tr("Creating...") : tr("Create Ticket")}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2.5 sm:gap-4 lg:grid-cols-6">
        {[
          { label: "Open Issues", value: statsOpen, icon: AlertCircle, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
          { label: "Assigned", value: statsAssigned, icon: Wrench, color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
          { label: "In Progress", value: statsInProgress, icon: Clock, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
          { label: "Overdue", value: statsOverdue, icon: AlertCircle, color: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400", urgent: true },
          { label: "Critical", value: statsCritical, icon: AlertCircle, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", urgent: true },
          { label: "Resolved", value: statsResolved, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" }
        ].map((stat, i) => (
          <motion.div
            key={tr(stat.label)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className={`group rounded-2xl border min-w-0 p-3 sm:p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80 ${stat.urgent && stat.value > 0 ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-card'}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-3">
              <p className={`text-xs sm:text-sm leading-snug font-medium ${stat.urgent && stat.value > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{tr(stat.label)}</p>
              <div className={`hidden sm:block shrink-0 rounded-xl p-2 ${stat.color} transition-transform duration-300 group-hover:scale-110`}>
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
        className="flex flex-col lg:flex-1 lg:min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-3 sm:p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tr("Search tickets...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2">
            <button 
              onClick={() => setViewMode('board')}
              aria-label={tr("Board view")}
              className={`hidden sm:inline-flex p-2 rounded-xl transition-all duration-200 border shadow-sm ${viewMode === 'board' ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:text-foreground border-border/60'}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Popover>
              <PopoverTrigger className="inline-flex w-full sm:w-auto whitespace-nowrap items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                <ListFilter className="h-4 w-4" />
                <span className="sm:hidden">{tr("Filters")}</span>
                <span className="hidden sm:inline">{tr("Advanced Filters")}</span>
                {([filterCategory, filterProperty, filterUnit, filterPriority, filterAssignee, filterReporter, filterStatus].filter(v => v !== "ALL").length > 0 || filterOverdue) && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {[filterCategory, filterProperty, filterUnit, filterPriority, filterAssignee, filterReporter, filterStatus].filter(v => v !== "ALL").length + (filterOverdue ? 1 : 0)}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] max-h-[70dvh] overflow-y-auto rounded-2xl p-4" align="end">
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm">{tr("Filter Tickets")}</h4>
                  
                  <div className="grid gap-2">
                    <Label className="text-xs text-muted-foreground">{tr("Category")}</Label>
                    <Select value={filterCategory} onValueChange={(val) => setFilterCategory(val || "ALL")}>
                      <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder={tr("All Categories")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">{tr("All Categories")}</SelectItem>
                        <SelectItem value="MAINTENANCE">{tr("Maintenance")}</SelectItem>
                        <SelectItem value="HOUSEKEEPING">{tr("Housekeeping")}</SelectItem>
                        <SelectItem value="GUEST_REQUEST">{tr("Guest Request")}</SelectItem>
                        <SelectItem value="COMPLAINT">{tr("Complaint")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs text-muted-foreground">{tr("Property")}</Label>
                    <Select value={filterProperty} onValueChange={(val) => { setFilterProperty(val || "ALL"); setFilterUnit("ALL"); }}>
                      <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder={tr("All Properties")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">{tr("All Properties")}</SelectItem>
                        {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {filterProperty !== "ALL" && (
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">{tr("Unit")}</Label>
                      <Select value={filterUnit} onValueChange={(val) => setFilterUnit(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder={tr("All Units")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">{tr("All Units")}</SelectItem>
                          {units.filter(u => u.propertyId === filterProperty).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">{tr("Priority")}</Label>
                      <Select value={filterPriority} onValueChange={(val) => setFilterPriority(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder={tr("All")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">{tr("All")}</SelectItem>
                          <SelectItem value="CRITICAL">{tr("Critical")}</SelectItem>
                          <SelectItem value="HIGH">{tr("High")}</SelectItem>
                          <SelectItem value="MEDIUM">{tr("Medium")}</SelectItem>
                          <SelectItem value="LOW">{tr("Low")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">{tr("Assignee")}</Label>
                      <Select value={filterAssignee} onValueChange={(val) => setFilterAssignee(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder={tr("All")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">{tr("All Staff")}</SelectItem>
                          <SelectItem value="UNASSIGNED">{tr("Unassigned")}</SelectItem>
                          {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">{tr("Reporter")}</Label>
                      <Select value={filterReporter} onValueChange={(val) => setFilterReporter(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder={tr("All")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">{tr("All Reporters")}</SelectItem>
                          <SelectItem value="GUEST">{tr("Guest")}</SelectItem>
                          <SelectItem value="TEAM">{tr("Team")}</SelectItem>
                          <SelectItem value="MANAGEMENT">{tr("Management")}</SelectItem>
                          <SelectItem value="SYSTEM">{tr("System")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">{tr("Status")}</Label>
                      <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "ALL")}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder={tr("All")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">{tr("All Status")}</SelectItem>
                          <SelectItem value="OPEN">{tr("Open")}</SelectItem>
                          <SelectItem value="ASSIGNED">{tr("Assigned")}</SelectItem>
                          <SelectItem value="IN_PROGRESS">{tr("In Progress")}</SelectItem>
                          <SelectItem value="RESOLVED">{tr("Resolved")}</SelectItem>
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
                      {tr("Show Overdue Only")}
                    </label>
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={() => {
                        setFilterCategory("ALL"); setFilterProperty("ALL"); setFilterUnit("ALL");
                        setFilterPriority("ALL"); setFilterAssignee("ALL"); setFilterReporter("ALL"); setFilterStatus("ALL"); setFilterOverdue(false);
                      }}
                      className="w-full text-sm sm:text-xs text-center py-2.5 sm:py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tr("Reset Filters")}
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Phone: pick a column. */}
        <div className="grid grid-cols-3 gap-1 border-b border-border/40 bg-muted/20 p-1.5 lg:hidden" role="tablist">
          {([
            ["open", "To Do", openTickets.length, "bg-amber-500"],
            ["progress", "In Progress", inProgressTickets.length, "bg-blue-500"],
            ["resolved", "Resolved", resolvedTickets.length, "bg-emerald-500"],
          ] as const).map(([key, label, count, dot]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mobileColumn === key}
              onClick={() => setMobileColumn(key)}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition-colors ${
                mobileColumn === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {tr(label)}
              <span className="text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        <div className="lg:flex-1 lg:overflow-auto bg-muted/10 p-3 sm:p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:h-full">
            <div className={`${mobileColumn === "open" ? "flex" : "hidden"} lg:flex flex-col lg:h-full lg:rounded-2xl lg:bg-muted/30 lg:border lg:border-border/40`}>
              <div className="hidden lg:flex p-3.5 border-b border-border/40 items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <h3 className="font-semibold text-sm">{tr("To Do")}</h3>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-2.5 py-1 rounded-lg border border-border/40">{openTickets.length}</span>
              </div>
              <div className="sm:grid sm:grid-cols-2 sm:gap-2.5 lg:block lg:p-2.5 flex-1 lg:overflow-y-auto">
                {openTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs sm:col-span-2">{tr("No open tickets")}</div>
                ) : openTickets.map(renderTicketCard)}
              </div>
            </div>

            <div className={`${mobileColumn === "progress" ? "flex" : "hidden"} lg:flex flex-col lg:h-full lg:rounded-2xl lg:bg-muted/30 lg:border lg:border-border/40`}>
              <div className="hidden lg:flex p-3.5 border-b border-border/40 items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <h3 className="font-semibold text-sm">{tr("In Progress")}</h3>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-2.5 py-1 rounded-lg border border-border/40">{inProgressTickets.length}</span>
              </div>
              <div className="sm:grid sm:grid-cols-2 sm:gap-2.5 lg:block lg:p-2.5 flex-1 lg:overflow-y-auto">
                {inProgressTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs sm:col-span-2">{tr("No tickets in progress")}</div>
                ) : inProgressTickets.map(renderTicketCard)}
              </div>
            </div>

            <div className={`${mobileColumn === "resolved" ? "flex" : "hidden"} lg:flex flex-col lg:h-full lg:rounded-2xl lg:bg-muted/30 lg:border lg:border-border/40`}>
              <div className="hidden lg:flex p-3.5 border-b border-border/40 items-center justify-between sticky top-0 bg-inherit z-10 backdrop-blur-sm rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <h3 className="font-semibold text-sm">{tr("Resolved")}</h3>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-2.5 py-1 rounded-lg border border-border/40">{resolvedTickets.length}</span>
              </div>
              <div className="sm:grid sm:grid-cols-2 sm:gap-2.5 lg:block lg:p-2.5 flex-1 lg:overflow-y-auto opacity-75">
                {resolvedTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs sm:col-span-2">{tr("No resolved tickets")}</div>
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
