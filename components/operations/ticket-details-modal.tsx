import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateTicketStatus, assignTicket } from "@/app/actions/operations"
import { formatDistanceToNow, isPast } from "date-fns"
import { AlertCircle, Clock, CheckCircle2, User, Wrench, Building } from "lucide-react"
import { TicketStatus } from "@prisma/client"

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

  const slaDeadline = new Date(ticket.slaDeadline)
  const isOverdue = isPast(slaDeadline) && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED'

  const getPriorityBadge = () => {
    switch(ticket.priority) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-600 border-red-500/20'
      case 'HIGH': return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
      case 'MEDIUM': return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
      default: return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl">
        <DialogHeader>
          <div className="flex justify-between items-start pr-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-lg border ${getPriorityBadge()}`}>
                  {ticket.priority}
                </span>
                <span className="text-xs text-muted-foreground font-mono">#{ticket.id.substring(ticket.id.length - 4)}</span>
              </div>
              <DialogTitle className="text-xl font-bold">{ticket.description.match(/\[(.*?)\]/)?.[1] || ticket.category}</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="text-sm leading-relaxed text-foreground/80 bg-muted/30 p-4 rounded-xl border border-border/40">
            {ticket.description.replace(/\[.*?\]\s*/, '')}
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
            
            <div className={`flex flex-col gap-1.5 p-3 rounded-xl border ${isOverdue ? 'border-red-500/30 bg-red-500/5' : 'border-border/40 bg-card'}`}>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">SLA Deadline</span>
              <div className={`flex items-center gap-2 font-medium text-sm ${isOverdue ? 'text-red-600' : ''}`}>
                <Clock className="w-4 h-4" /> 
                {isOverdue ? 'Overdue by ' : 'Due in '}
                {formatDistanceToNow(slaDeadline)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 pt-4 border-t border-border/40">
            <h4 className="font-semibold text-sm">Ticket Management</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-medium text-muted-foreground">Assignee</label>
                <Select disabled={isUpdating} value={ticket.assignedToId || "unassigned"} onValueChange={handleAssignmentChange}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned" className="text-muted-foreground italic">Unassigned</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>{member.name} ({member.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select disabled={isUpdating} value={ticket.status} onValueChange={handleStatusChange}>
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
