import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateTicketStatus, assignTicket } from "@/app/actions/operations"
import { formatDistanceToNow, isPast, addMinutes, differenceInMinutes } from "date-fns"
import { AlertCircle, Clock, CheckCircle2, User, Wrench, Building, History, TimerReset } from "lucide-react"
import { TicketStatus } from "@prisma/client"
import { format } from "date-fns"

function mapCategoryToDepartment(category: string): string {
  switch (category) {
    case "HOUSEKEEPING": return "Housekeeping";
    case "MAINTENANCE": return "Maintenance";
    case "GUEST_REQUEST": return "Front Desk";
    case "GUEST_COMPLAINT": return "Management";
    case "INVENTORY": return "Inventory";
    case "IT_SYSTEM": return "IT";
    case "PROPERTY": return "Property";
    case "SAFETY": return "Security";
    default: return "General";
  }
}

export function TicketDetailsModal({ 
  ticket, 
  isOpen, 
  onClose,
  teamMembers
}: { 
  ticket: any | null, 
  isOpen: boolean, 
  onClose: () => void,
  teamMembers: any[]
}) {
  const [isUpdating, setIsUpdating] = useState(false)

  if (!ticket) return null

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true)
    await updateTicketStatus(ticket.id, newStatus as TicketStatus)
    setIsUpdating(false)
  }

  const handleAssignmentChange = async (teamMemberId: string) => {
    setIsUpdating(true)
    await assignTicket(ticket.id, teamMemberId)
    setIsUpdating(false)
  }

  const slaDeadline = ticket.slaDeadline ? new Date(ticket.slaDeadline) : new Date()
  const isOverdue = ticket.slaDeadline ? (isPast(slaDeadline) && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') : false

  const getPriorityBadge = () => {
    switch(ticket.priority) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-600 border-red-500/20'
      case 'HIGH': return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
      case 'MEDIUM': return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
      default: return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    }
  }

  // Filter team members by property and department
  const expectedDepartment = mapCategoryToDepartment(ticket.category);
  const eligibleMembers = teamMembers.filter(m => 
    m.propertyId === ticket.propertyId && 
    m.department?.toLowerCase() === expectedDepartment.toLowerCase()
  );

  // Calculate timeout for ASSIGNED status
  let timeoutMinutesLeft = 0;
  if (ticket.status === 'ASSIGNED' && ticket.updatedAt) {
     const assignedAt = new Date(ticket.updatedAt);
     const timeoutAt = addMinutes(assignedAt, 10);
     timeoutMinutesLeft = differenceInMinutes(timeoutAt, new Date());
  }

  const isAutoTask = !!ticket.isAutoTask;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <div className="flex justify-between items-start pr-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-lg border ${getPriorityBadge()}`}>
                  {ticket.priority}
                </span>
                <span className="text-xs text-muted-foreground font-mono">#{ticket.id.substring(ticket.id.length - 4)}</span>
                
                {ticket.status === 'ASSIGNED' && timeoutMinutesLeft > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-lg border bg-amber-500/10 text-amber-600 border-amber-500/20">
                    <TimerReset className="w-3.5 h-3.5" />
                    Timeout in {timeoutMinutesLeft}m
                  </span>
                )}
                {ticket.status === 'ASSIGNED' && timeoutMinutesLeft <= 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-lg border bg-red-500/10 text-red-600 border-red-500/20">
                    <TimerReset className="w-3.5 h-3.5" />
                    Escalating Soon
                  </span>
                )}
              </div>
              <DialogTitle className="text-xl font-bold">
                {ticket.description ? (ticket.description.match(/\[(.*?)\]/)?.[1] || ticket.title || ticket.category) : (ticket.title || ticket.category)}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="text-sm leading-relaxed text-foreground/80 bg-muted/30 p-4 rounded-xl border border-border/40">
            {ticket.description ? ticket.description.replace(/\[.*?\]\s*/, '') : 'No description provided.'}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-border/40 bg-card">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Location</span>
              <div className="flex items-center gap-2 font-medium text-sm">
                {ticket.unit ? (
                  <><Building className="w-4 h-4 text-muted-foreground" /> {ticket.unit.name}</>
                ) : (
                  <><Building className="w-4 h-4 text-muted-foreground" /> Property-wide</>
                )}
              </div>
            </div>
            
            {ticket.slaDeadline ? (
              <div className={`flex flex-col gap-1.5 p-3 rounded-xl border ${isOverdue ? 'border-red-500/30 bg-red-500/5' : 'border-border/40 bg-card'}`}>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">SLA Deadline</span>
                <div className={`flex items-center gap-2 font-medium text-sm ${isOverdue ? 'text-red-600' : ''}`}>
                  <Clock className="w-4 h-4" /> 
                  {isOverdue ? 'Overdue by ' : 'Due in '}
                  {formatDistanceToNow(slaDeadline)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-border/40 bg-card">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Task Type</span>
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Clock className="w-4 h-4" /> Automated Task
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 pt-4 border-t border-border/40">
            <h4 className="font-semibold text-sm">Ticket Management {isAutoTask && <span className="text-xs font-normal text-muted-foreground ml-2">(Read-only for Auto Tasks)</span>}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Assignee <span className="italic opacity-60">({expectedDepartment})</span>
                </label>
                <Select disabled={isUpdating || isAutoTask} value={ticket.assignedToId || "unassigned"} onValueChange={handleAssignmentChange}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned" className="text-muted-foreground italic">Unassigned</SelectItem>
                    {eligibleMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name.split(' ')[0]} ({member.id.substring(member.id.length - 4)})
                      </SelectItem>
                    ))}
                    {eligibleMembers.length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground italic">No members found in {expectedDepartment}</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select disabled={isUpdating || isAutoTask} value={ticket.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Update status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="TRIAGED">Triaged</SelectItem>
                    <SelectItem value="ASSIGNED">Assigned</SelectItem>
                    <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Audit Logs Timeline */}
          {ticket.auditLogs && ticket.auditLogs.length > 0 && (
            <div className="pt-4 border-t border-border/40">
              <h4 className="font-semibold text-sm flex items-center gap-2 mb-4">
                <History className="w-4 h-4 text-muted-foreground" />
                History & Audit Logs
              </h4>
              <div className="space-y-4 pl-2 border-l-2 border-muted relative">
                {ticket.auditLogs.map((log: any, idx: number) => (
                  <div key={log.id} className="relative pl-4">
                    {/* Timeline dot */}
                    <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-primary ring-4 ring-background" />
                    
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{log.action.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground">{format(new Date(log.createdAt), 'MMM d, h:mm a')}</span>
                      </div>
                      {log.notes && (
                        <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-md mt-1">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="pt-2 border-t border-border/40">
             <div className="flex items-center gap-2 text-xs text-muted-foreground">
               <User className="w-3.5 h-3.5" />
               Reported by {ticket.reporterType === 'GUEST' ? (ticket.guest?.name || 'Guest') : 'Staff'} • {formatDistanceToNow(new Date(ticket.createdAt))} ago
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
