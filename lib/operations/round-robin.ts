import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events/bus";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

// Utility to map TicketCategory (enum) to typical Department names (string)
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

export async function assignTicketRoundRobin(ticketId: string, excludeMemberId?: string) {
  try {
    // 1. Fetch the ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { property: true, unit: true }
    });

    if (!ticket || ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      return { success: false, error: "Ticket not found or already closed." };
    }

    const department = mapCategoryToDepartment(ticket.category);

    // 2. Fetch eligible active team members in that location and department
    let eligibleMembers = await prisma.teamMember.findMany({
      where: {
        propertyId: ticket.propertyId,
        isActive: true,
        department: { equals: department, mode: "insensitive" } // Postgres mode for case-insensitive
      },
      orderBy: { id: 'asc' }
    });

    // Fallback: If no one in that department, find ANY active member in that location
    if (eligibleMembers.length === 0) {
      eligibleMembers = await prisma.teamMember.findMany({
        where: {
          propertyId: ticket.propertyId,
          isActive: true
        },
        orderBy: { id: 'asc' }
      });
    }

    if (eligibleMembers.length === 0) {
      return { success: false, error: "No active team members available in this location." };
    }

    // Exclude member if escalating
    if (excludeMemberId && eligibleMembers.length > 1) {
      eligibleMembers = eligibleMembers.filter(m => m.id !== excludeMemberId);
    }

    // 3. Determine the "Next" member
    // Find the most recently assigned ticket for this property and category
    const lastAssignedTicket = await prisma.ticket.findFirst({
      where: {
        propertyId: ticket.propertyId,
        category: ticket.category,
        assignedToId: { not: null },
        id: { not: ticketId } // Don't match the current ticket if it already had an assignee
      },
      orderBy: { updatedAt: 'desc' } // using updatedAt since it changes on assignment
    });

    let nextAssignee = eligibleMembers[0]; // Default to first

    if (lastAssignedTicket && lastAssignedTicket.assignedToId) {
      const lastIndex = eligibleMembers.findIndex(m => m.id === lastAssignedTicket.assignedToId);
      if (lastIndex !== -1) {
        // Pick the next one in the array (wrap around to 0)
        const nextIndex = (lastIndex + 1) % eligibleMembers.length;
        nextAssignee = eligibleMembers[nextIndex];
      }
    }

    // 4. Update the ticket
    const actorId = "system-round-robin";
    const actionNote = excludeMemberId 
      ? `Ticket auto-escalated to ${nextAssignee.name} due to timeout.` 
      : `Ticket auto-assigned to ${nextAssignee.name} via round-robin.`;

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        assignedToId: nextAssignee.id,
        status: "ASSIGNED",
        auditLogs: {
          create: {
            action: excludeMemberId ? "TICKET_ESCALATED" : "TICKET_ASSIGNED",
            actorId: actorId,
            actorType: "MANAGEMENT",
            toStatus: "ASSIGNED",
            notes: actionNote
          }
        }
      }
    });

    // 5. Notify via WhatsApp (Handled by TICKET_ASSIGNED event listener)
    // Notify original assignee if it's an escalation
    if (excludeMemberId) {
      const oldAssignee = await prisma.teamMember.findUnique({ where: { id: excludeMemberId } });
      if (oldAssignee) {
         await sendWhatsAppMessage(
            oldAssignee.whatsappNumber,
            'text',
            `⚠️ Ticket "${ticket.description}" was reassigned to another team member because it was not accepted in time.`,
            undefined,
            'ticket',
            ticket.id
         );
      }
    }

    await eventBus.emit('TICKET_ASSIGNED', {
      ticketId: updatedTicket.id,
      assignedToId: nextAssignee.id,
      propertyId: updatedTicket.propertyId,
      unitId: updatedTicket.unitId,
      priority: updatedTicket.priority,
      status: updatedTicket.status
    });

    return { success: true, assignee: nextAssignee };

  } catch (error: any) {
    console.error("[Round Robin Assignment Error]", error);
    return { success: false, error: error.message };
  }
}

export async function assignHousekeepingTaskRoundRobin(taskId: string) {
  try {
    // 1. Fetch the task
    const task = await prisma.housekeepingTask.findUnique({
      where: { id: taskId },
      include: { property: true, unit: true }
    });

    if (!task || task.status === 'COMPLETED') {
      return { success: false, error: "Task not found or already completed." };
    }

    // 2. Fetch eligible active team members in that location and Housekeeping department
    let eligibleMembers = await prisma.teamMember.findMany({
      where: {
        propertyId: task.propertyId,
        isActive: true,
        department: { equals: "Housekeeping", mode: "insensitive" }
      },
      orderBy: { id: 'asc' }
    });

    // Fallback: If no one in Housekeeping, find ANY active member in that location
    if (eligibleMembers.length === 0) {
      eligibleMembers = await prisma.teamMember.findMany({
        where: {
          propertyId: task.propertyId,
          isActive: true
        },
        orderBy: { id: 'asc' }
      });
    }

    if (eligibleMembers.length === 0) {
      return { success: false, error: "No active team members available in this location." };
    }

    // 3. Determine the "Next" member
    const lastAssignedTask = await prisma.housekeepingTask.findFirst({
      where: {
        propertyId: task.propertyId,
        assignedToId: { not: null },
        id: { not: taskId }
      },
      orderBy: { updatedAt: 'desc' } 
    });

    let nextAssignee = eligibleMembers[0]; // Default to first

    if (lastAssignedTask && lastAssignedTask.assignedToId) {
      const lastIndex = eligibleMembers.findIndex(m => m.id === lastAssignedTask.assignedToId);
      if (lastIndex !== -1) {
        const nextIndex = (lastIndex + 1) % eligibleMembers.length;
        nextAssignee = eligibleMembers[nextIndex];
      }
    }

    // 4. Update the task
    const updatedTask = await prisma.housekeepingTask.update({
      where: { id: task.id },
      data: {
        assignedToId: nextAssignee.id,
        status: "PENDING"
      }
    });

    // 5. Notify via WhatsApp
    const messageContent = `🧹 *NEW HOUSEKEEPING TASK*\nProperty: ${task.property.name}\nUnit: ${task.unit.name}\nPriority: HIGH\n\nReply ACCEPT to assign it to yourself. Reply COMPLETE when finished.`;
    
    await sendWhatsAppMessage(
      nextAssignee.whatsappNumber,
      'template',
      messageContent,
      'team_new_task',
      'task',
      task.id,
      {
        '1': task.property.name,
        '2': task.unit.name,
        '3': 'HIGH'
      }
    );

    return { success: true, assignee: nextAssignee };

  } catch (error: any) {
    console.error("[Housekeeping Round Robin Assignment Error]", error);
    return { success: false, error: error.message };
  }
}
