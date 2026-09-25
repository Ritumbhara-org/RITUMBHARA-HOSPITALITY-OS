"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { TicketCategory, TicketPriority, ReporterType, TicketStatus } from "@prisma/client"
import { eventBus } from "@/lib/events/bus"
import { assignTicketRoundRobin } from "@/lib/operations/round-robin"
import { sendWhatsAppMessage } from "@/lib/whatsapp/client"

export async function createTicket(formData: FormData) {
  try {
    const title = formData.get("title") as string 
    const description = formData.get("description") as string
    const category = formData.get("category") as TicketCategory
    const priority = formData.get("priority") as TicketPriority
    
    // We removed reporterType from the form, default it to TEAM
    const reporterType: ReporterType = "TEAM"
    
    let propertyId = formData.get("propertyId") as string
    if (!propertyId) {
      let defaultProperty = await prisma.property.findFirst()
      if (!defaultProperty) throw new Error("No property found")
      propertyId = defaultProperty.id
    }

    let teamMember = await prisma.teamMember.findFirst({ where: { role: "MANAGER" } })
    if (!teamMember) {
       teamMember = await prisma.teamMember.findFirst()
    }
    if (!teamMember) throw new Error("No team member found to act as reporter")
    const reporterId = teamMember.id

    const unitId = formData.get("unitId") as string
    const assigneeId = formData.get("assigneeId") as string
    const isManuallyAssigned = assigneeId && assigneeId !== "unassigned"

    const fullDescription = `[${title || 'Alert'}] ${description}`

    const slaDeadline = new Date()
    const responseSlaDeadline = new Date()
    switch (priority) {
      case 'CRITICAL': 
        slaDeadline.setMinutes(slaDeadline.getMinutes() + 30); 
        responseSlaDeadline.setMinutes(responseSlaDeadline.getMinutes() + 5);
        break;
      case 'HIGH': 
        slaDeadline.setHours(slaDeadline.getHours() + 1); 
        responseSlaDeadline.setMinutes(responseSlaDeadline.getMinutes() + 10);
        break;
      case 'MEDIUM': 
        slaDeadline.setHours(slaDeadline.getHours() + 2); 
        responseSlaDeadline.setMinutes(responseSlaDeadline.getMinutes() + 30);
        break;
      case 'LOW': 
        slaDeadline.setHours(slaDeadline.getHours() + 24); 
        responseSlaDeadline.setHours(responseSlaDeadline.getHours() + 4);
        break;
    }

    const ticket = await prisma.ticket.create({
      data: {
        description: fullDescription,
        category: category,
        priority: priority,
        propertyId: propertyId,
        reporterId: reporterId,
        reporterType: reporterType,
        status: isManuallyAssigned ? "ASSIGNED" : "OPEN", // Will be updated if round-robin assigns it
        assignedToId: isManuallyAssigned ? assigneeId : null,
        slaDeadline: slaDeadline,
        unitId: (!unitId || unitId === 'property') ? null : unitId,
        auditLogs: {
          create: {
            action: isManuallyAssigned ? "TICKET_ASSIGNED" : "TICKET_CREATED",
            actorId: reporterId,
            actorType: reporterType,
            toStatus: isManuallyAssigned ? "ASSIGNED" : "OPEN",
            notes: isManuallyAssigned ? `Created and manually assigned to team member ${assigneeId}` : undefined
          }
        }
      }
    })

    if (isManuallyAssigned) {
      const assignedMember = await prisma.teamMember.findUnique({ where: { id: assigneeId } });
      // (Handled by TICKET_ASSIGNED event listener)

      await eventBus.emit('TICKET_ASSIGNED', {
        ticketId: ticket.id,
        assignedToId: assigneeId,
        propertyId: ticket.propertyId,
        unitId: ticket.unitId,
        priority: ticket.priority,
        status: ticket.status
      })
    } else {
      // Auto-assign via Round Robin if no specific assignee was selected
      await assignTicketRoundRobin(ticket.id);
    }

    revalidatePath("/operations")
    revalidatePath("/dashboard")
    return { success: true, ticket }
  } catch (error: any) {
    console.error("Failed to create ticket:", error)
    return { success: false, error: error.message }
  }
}

export async function assignTicket(ticketId: string, teamMemberId: string) {
  try {
    // In real app, actorId is from session
    const actor = await prisma.teamMember.findFirst({ where: { role: "MANAGER" } })
    
    const assignedMember = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
    if (!assignedMember) throw new Error("Team member not found");

    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedToId: teamMemberId,
        status: "ASSIGNED",
        updatedAt: new Date(),
        auditLogs: {
          create: {
            action: "TICKET_ASSIGNED",
            actorId: actor?.id || "system",
            actorType: "MANAGEMENT",
            toStatus: "ASSIGNED",
            notes: `Manually reassigned to ${assignedMember.name}`
          }
        }
      }
    })

    // (Handled by TICKET_ASSIGNED event listener)
    await eventBus.emit('TICKET_ASSIGNED', {
      ticketId: ticket.id,
      assignedToId: teamMemberId,
      propertyId: ticket.propertyId,
      unitId: ticket.unitId,
      priority: ticket.priority,
      status: ticket.status
    })

    revalidatePath("/operations")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateTicketStatus(ticketId: string, newStatus: TicketStatus, notes?: string) {
  try {
    // In real app, actorId is from session
    const actor = await prisma.teamMember.findFirst()
    
    const updateData: any = {
      status: newStatus,
      auditLogs: {
        create: {
          action: `STATUS_CHANGED_TO_${newStatus}`,
          actorId: actor?.id || "system",
          actorType: "TEAM",
          toStatus: newStatus,
          notes: notes
        }
      }
    }

    if (newStatus === "RESOLVED") {
      updateData.resolvedAt = new Date()
    } else if (newStatus === "CLOSED") {
      updateData.closedAt = new Date()
    }

    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData
    })
    
    await eventBus.emit('TICKET_UPDATED', {
      ticketId: ticket.id,
      assignedToId: ticket.assignedToId || undefined,
      propertyId: ticket.propertyId,
      unitId: ticket.unitId,
      priority: ticket.priority,
      status: ticket.status
    })

    if (newStatus === "RESOLVED") {
      await eventBus.emit('TICKET_RESOLVED', {
        ticketId: ticket.id,
        propertyId: ticket.propertyId,
        unitId: ticket.unitId,
        priority: ticket.priority,
        status: ticket.status
      })
    }

    revalidatePath("/operations")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
