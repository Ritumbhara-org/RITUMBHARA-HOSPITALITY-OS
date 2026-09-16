"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { TicketCategory, TicketPriority, ReporterType, TicketStatus } from "@prisma/client"
import { eventBus } from "@/lib/events/bus"

export async function createTicket(formData: FormData) {
  try {
    const title = formData.get("title") as string 
    const description = formData.get("description") as string
    const category = formData.get("category") as TicketCategory
    const priority = formData.get("priority") as TicketPriority
    
    // We removed reporterType from the form, default it to TEAM
    const reporterType: ReporterType = "TEAM"
    
    let defaultProperty = await prisma.property.findFirst()
    if (!defaultProperty) throw new Error("No property found")

    let teamMember = await prisma.teamMember.findFirst({ where: { role: "MANAGER" } })
    if (!teamMember) {
       teamMember = await prisma.teamMember.findFirst()
    }
    if (!teamMember) throw new Error("No team member found to act as reporter")
    const reporterId = teamMember.id

    const unitId = formData.get("unitId") as string
    const assigneeId = formData.get("assigneeId") as string
    const isAssigned = assigneeId && assigneeId !== "unassigned"

    const fullDescription = `[${title}] ${description}`

    const slaDeadline = new Date()
    switch(priority) {
      case 'CRITICAL': slaDeadline.setMinutes(slaDeadline.getMinutes() + 30); break;
      case 'HIGH': slaDeadline.setHours(slaDeadline.getHours() + 1); break;
      case 'MEDIUM': slaDeadline.setHours(slaDeadline.getHours() + 2); break;
      case 'LOW': slaDeadline.setHours(slaDeadline.getHours() + 24); break;
    }

    const ticket = await prisma.ticket.create({
      data: {
        description: fullDescription,
        category: category,
        priority: priority,
        propertyId: defaultProperty.id,
        reporterId: reporterId,
        reporterType: reporterType,
        status: isAssigned ? "ASSIGNED" : "OPEN",
        assignedToId: isAssigned ? assigneeId : null,
        slaDeadline: slaDeadline,
        unitId: (!unitId || unitId === 'property') ? null : unitId,
        auditLogs: {
          create: {
            action: isAssigned ? "TICKET_ASSIGNED" : "TICKET_CREATED",
            actorId: reporterId,
            actorType: reporterType,
            toStatus: isAssigned ? "ASSIGNED" : "OPEN",
            notes: isAssigned ? `Created and instantly assigned to team member ${assigneeId}` : undefined
          }
        }
      }
    })

    if (isAssigned) {
      await eventBus.emit('TICKET_ASSIGNED', {
        ticketId: ticket.id,
        assignedToId: assigneeId,
        propertyId: ticket.propertyId,
        unitId: ticket.unitId,
        priority: ticket.priority,
        status: ticket.status
      })
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
    
    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedToId: teamMemberId,
        status: "ASSIGNED",
        auditLogs: {
          create: {
            action: "TICKET_ASSIGNED",
            actorId: actor?.id || "system",
            actorType: "MANAGEMENT",
            toStatus: "ASSIGNED",
            notes: `Assigned to team member ${teamMemberId}`
          }
        }
      }
    })
    
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

    revalidatePath("/operations")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
