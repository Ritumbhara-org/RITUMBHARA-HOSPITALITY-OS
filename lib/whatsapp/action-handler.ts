import { prisma } from "@/lib/prisma";

export async function handleWhatsAppAction(senderPhone: string, messageText: string): Promise<string | null> {
  try {
    // 1. Identify the Team Member by their WhatsApp number (ignoring spaces)
    const members = await prisma.teamMember.findMany({
      where: { isActive: true },
    });
    
    const teamMember = members.find(m => 
      m.whatsappNumber.replace(/\s+/g, '') === senderPhone
    );

    if (!teamMember) {
      // Return null so we don't spam regular guests with an error message
      return null;
    }

    // 2. Look for active TICKETS first
    const activeTicket = await prisma.ticket.findFirst({
      where: {
        assignedToId: teamMember.id,
        status: { in: ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS"] }
      },
      orderBy: { updatedAt: 'desc' },
      include: { unit: true }
    });

    if (activeTicket) {
      if (messageText.includes("ACCEPT")) {
        await prisma.ticket.update({
          where: { id: activeTicket.id },
          data: { status: "ACKNOWLEDGED" }
        });
        return `✅ Ticket Acknowledged! Reply 'START' when you begin working on it.`;
      }
      
      if (messageText.includes("START")) {
        await prisma.ticket.update({
          where: { id: activeTicket.id },
          data: { status: "IN_PROGRESS" }
        });
        return `✅ Ticket In Progress. Reply 'RESOLVE' when the issue is fixed.`;
      }

      if (messageText.includes("RESOLVE") || messageText.includes("COMPLETE")) {
        await prisma.ticket.update({
          where: { id: activeTicket.id },
          data: { status: "RESOLVED", resolvedAt: new Date() }
        });
        return `🌟 Great job, ${teamMember.name}! The ticket has been resolved.`;
      }

      const isActionCommand = ["ACCEPT", "START", "RESOLVE", "COMPLETE"].some(cmd => messageText.includes(cmd));
      if (isActionCommand) {
        return `You have an active ticket: ${activeTicket.description}\nReply ACCEPT, START, or RESOLVE.`;
      }
      return null;
    }

    // 3. Fallback to Housekeeping Tasks
    const activeTask = await prisma.housekeepingTask.findFirst({
      where: {
        OR: [
          { status: "PENDING" },
          { status: "IN_PROGRESS", assignedToId: teamMember.id }
        ]
      },
      orderBy: { createdAt: 'asc' },
      include: { unit: true }
    });

    if (!activeTask) {
      // If they explicitly typed a command, we can tell them they have no tasks.
      // Otherwise, return null so they can chat normally as a guest.
      const isActionCommand = ["ACCEPT", "START", "RESOLVE", "COMPLETE"].some(cmd => messageText.includes(cmd));
      if (isActionCommand) {
        return `Hello ${teamMember.name}! You currently have no active tasks or tickets. Enjoy your break!`;
      }
      return null;
    }

    // 4. Process Housekeeping Actions
    if (messageText.includes("ACCEPT")) {
      if (activeTask.status !== "PENDING") {
        return `Task for Room ${activeTask.unit.name} is already accepted. Send COMPLETE when finished.`;
      }
      
      await prisma.housekeepingTask.update({
        where: { id: activeTask.id },
        data: {
          status: "IN_PROGRESS",
          assignedToId: teamMember.id
        }
      });
      
      return `✅ Task Accepted! You are now assigned to clean Room ${activeTask.unit.name}. Send COMPLETE when finished.`;
    } 
    
    if (messageText.includes("COMPLETE") || messageText.includes("RESOLVE")) {
      if (activeTask.status === "PENDING") {
        return `Please ACCEPT the task for Room ${activeTask.unit.name} first before completing it.`;
      }

      // Mark task as completed
      await prisma.housekeepingTask.update({
        where: { id: activeTask.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date()
        }
      });

      // Automatically update the physical room status to READY
      await prisma.unit.update({
        where: { id: activeTask.unitId },
        data: { status: "READY" }
      });

      return `🌟 Amazing work, ${teamMember.name}! Room ${activeTask.unit.name} is now marked as READY in the system.`;
    }

    // 5. Default Fallback
    // Only send the fallback if they sent an unrecognized command that might have been a typo,
    // or just return null to ignore normal chat messages so they can chat as a guest.
    const isActionCommand = ["ACCEPT", "START", "RESOLVE", "COMPLETE"].some(cmd => messageText.includes(cmd));
    
    if (isActionCommand) {
       return `Command not recognized for your current task status. Please check your active task.`;
    }

    // Return null to ignore regular text messages (allows them to act as a guest)
    return null;

  } catch (error) {
    console.error("[Action Handler Error]", error);
    return null;
  }
}
