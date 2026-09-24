import { prisma } from "@/lib/prisma";

export async function handleWhatsAppAction(senderPhone: string, messageText: string, mediaUrl?: string | null): Promise<string | null> {
  try {
    // 1. Identify all Team Members by their WhatsApp number (ignoring spaces)
    const members = await prisma.teamMember.findMany({
      where: { isActive: true },
    });
    
    const matchingMembers = members.filter(m => 
      m.whatsappNumber.replace(/\s+/g, '') === senderPhone
    );

    if (matchingMembers.length === 0) {
      // Return null so we don't spam regular guests with an error message
      return null;
    }

    let activeTicket = null;
    let activeTask = null;
    let actingTeamMember = matchingMembers[0]; // Default to first if none have active tasks

    // 2. Look for active TICKETS or TASKS across all matching members (crucial for testing shared numbers)
    for (const member of matchingMembers) {
      // Check tickets
      const ticket = await prisma.ticket.findFirst({
        where: {
          assignedToId: member.id,
          status: { in: ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS"] }
        },
        orderBy: { updatedAt: 'desc' },
        include: { unit: true }
      });
      
      if (ticket) {
        activeTicket = ticket;
        actingTeamMember = member;
        break; // Found an active ticket, stop looking
      }

      // Check tasks
      const task = await prisma.housekeepingTask.findFirst({
        where: {
          assignedToId: member.id,
          status: { in: ["PENDING", "IN_PROGRESS"] }
        },
        orderBy: { createdAt: 'asc' },
        include: { unit: true }
      });

      if (task) {
        activeTask = task;
        actingTeamMember = member;
        break; // Found an active task, stop looking
      }
    }

    // Now proceed with actingTeamMember and their found ticket/task
    const teamMember = actingTeamMember;

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

      if (messageText.includes("RESOLVE") || messageText.includes("COMPLETE") || mediaUrl) {
        
        let attachmentsJson = "[]";
        if (mediaUrl) {
           const currentAttachments = Array.isArray(activeTicket.attachments) 
              ? activeTicket.attachments 
              : JSON.parse(activeTicket.attachments?.toString() || "[]");
           
           attachmentsJson = JSON.stringify([...currentAttachments, mediaUrl]);
        }

        const resolvedTicket = await prisma.ticket.update({
          where: { id: activeTicket.id },
          data: { 
            status: "RESOLVED", 
            resolvedAt: new Date(),
            attachments: attachmentsJson 
          }
        });
        
        // Import eventBus dynamically or statically at top
        const { eventBus } = await import("@/lib/events/bus");
        await eventBus.emit('TICKET_RESOLVED', {
          ticketId: resolvedTicket.id,
          propertyId: resolvedTicket.propertyId,
          unitId: resolvedTicket.unitId,
          priority: resolvedTicket.priority,
          status: resolvedTicket.status
        });

        return `🌟 Great job, ${teamMember.name}! The ticket has been resolved${mediaUrl ? ' with photo evidence' : ''}.`;
      }

      const isActionCommand = ["ACCEPT", "START", "RESOLVE", "COMPLETE"].some(cmd => messageText.includes(cmd));
      if (isActionCommand) {
        return `You have an active ticket: ${activeTicket.description}\nReply ACCEPT, START, or RESOLVE.`;
      }
      return null;
    }

    // 3. Process Housekeeping Actions (Fallback)
    // We already found activeTask in the loop above if one existed
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
    
    if (messageText.includes("COMPLETE") || messageText.includes("RESOLVE") || mediaUrl) {
      if (activeTask.status === "PENDING") {
        return `Please ACCEPT the task for Room ${activeTask.unit.name} first before completing it.`;
      }

      let photosJson = "[]";
      if (mediaUrl) {
         const currentPhotos = Array.isArray(activeTask.photoUrls) 
            ? activeTask.photoUrls 
            : JSON.parse(activeTask.photoUrls?.toString() || "[]");
         
         photosJson = JSON.stringify([...currentPhotos, mediaUrl]);
      }

      // Mark task as completed
      await prisma.housekeepingTask.update({
        where: { id: activeTask.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          photoUrls: photosJson
        }
      });

      // Automatically update the physical room status to READY
      await prisma.unit.update({
        where: { id: activeTask.unitId },
        data: { status: "READY" }
      });

      return `🌟 Amazing work, ${teamMember.name}! Room ${activeTask.unit.name} is now marked as READY in the system${mediaUrl ? ' with photo evidence' : ''}.`;
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
