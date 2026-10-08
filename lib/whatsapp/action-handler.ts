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
      // Check tickets specifically assigned to them
      const ticket = await prisma.ticket.findFirst({
        where: {
          assignedToId: member.id,
          status: { in: ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS"] }
        },
        orderBy: { updatedAt: 'desc' },
        include: { unit: true, guest: true }
      });
      
      if (ticket) {
        activeTicket = ticket;
        actingTeamMember = member;
        break; // Found an active ticket, stop looking
      }

      // Check for UNASSIGNED points redemption (or general) tickets at their property
      // if they are Front Desk or Admin
      if (member.role === "ADMIN" || member.department === "FRONT_DESK") {
        const unassignedTicket = await prisma.ticket.findFirst({
          where: {
            propertyId: member.propertyId,
            assignedToId: null,
            status: "OPEN",
            subcategory: "POINTS_REDEMPTION"
          },
          orderBy: { createdAt: 'desc' },
          include: { unit: true, guest: true }
        });

        if (unassignedTicket) {
          activeTicket = unassignedTicket;
          actingTeamMember = member;
          break;
        }
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
        return `✅ Ticket Acknowledged! Just write whatever you want to convey to the guest below, and I will let them know.`;
      }
      
      if (messageText.includes("START")) {
        await prisma.ticket.update({
          where: { id: activeTicket.id },
          data: { status: "IN_PROGRESS" }
        });
        return `✅ Ticket In Progress. Just write whatever you want to convey to the guest when finished.`;
      }

      let isResolving = false;
      let resolutionNote = "resolved";
      
      if (messageText.includes("RESOLVE") || messageText.includes("COMPLETE") || messageText.includes("DONE") || messageText.includes("NOTED") || mediaUrl) {
        isResolving = true;
        resolutionNote = messageText.replace(/RESOLVE|COMPLETE|DONE|NOTED/gi, "").trim();
        if (resolutionNote.length === 0) resolutionNote = "resolved";
      }

      const isActionCommand = ["ACCEPT", "START", "RESOLVE", "COMPLETE", "DONE", "NOTED"].some(cmd => messageText.toUpperCase().includes(cmd));

      // Natural Language Intent Engine!
      if (!isActionCommand && !mediaUrl && activeTicket.status !== "RESOLVED" && activeTicket.status !== "CLOSED") {
        const { ai } = await import("@/lib/ai/groq");
        const prompt = `You are an AI assistant managing a hotel ticketing system. 
A hotel guest raised this issue/request: "${activeTicket.description}"
The assigned staff member replied with: "${messageText}"

Analyze the staff member's reply (which might be in English, Hindi, or Hinglish) and determine their intent.
Intents:
1. "ACCEPT": The staff is purely acknowledging the ticket internally ("ok", "on it", "will do"). NO message goes to the guest.
2. "RESOLVE": The staff is confirming a physical task is fully complete/delivered ("de diya", "done", "fixed"). NO message goes to the guest, ticket is closed.
3. "ANSWER_AND_RESOLVE": The staff is directly answering the guest's request, setting a condition, or giving an update (e.g. "haan ho jayega but extra 200 lagenge", "we don't have extra towels"). The ticket should be resolved AND the message forwarded to the guest.
4. "UNKNOWN": Gibberish or unrelated.

IMPORTANT: If intent is ANSWER_AND_RESOLVE, you MUST generate a "messageForGuest". This message MUST be written in the exact same language/tone that the guest used in their original request! 
For example, if the guest asked in Hinglish, the messageForGuest should be in Hinglish ("Haan late check-in ho jayega, but 200/hr extra lagega."). If English, use English.

Output JSON:
{
  "intent": "ACCEPT" | "RESOLVE" | "ANSWER_AND_RESOLVE" | "UNKNOWN",
  "messageForGuest": "Message to send to the guest (only if ANSWER_AND_RESOLVE). null otherwise.",
  "staffReply": "A short confirmation message to send back to the staff (e.g. '✅ Ticket Accepted', or '✅ Message sent to guest & ticket resolved')."
}`;

        try {
           const chatCompletion = await ai.chat.completions.create({
             messages: [{ role: "system", content: prompt }],
             model: "openai/gpt-oss-120b",
             response_format: { type: "json_object" }
           });
           
           const parsed = JSON.parse(chatCompletion.choices[0]?.message?.content || '{"intent": "UNKNOWN"}');
           
           if (parsed.intent === "UNKNOWN") {
             return `⚠️ I didn't quite catch that. You can reply with 'ACCEPT' to acknowledge, or 'RESOLVE <message>' to close the ticket.`;
           }

           if (parsed.intent === "ACCEPT") {
             await prisma.ticket.update({
               where: { id: activeTicket.id },
               data: { status: "ACKNOWLEDGED" }
             });
             return parsed.staffReply || `✅ Ticket Acknowledged!`;
           }

           if (parsed.intent === "ANSWER_AND_RESOLVE") {
             isResolving = true;
             // Set the resolution note to the generated message for the guest.
             // The TICKET_RESOLVED event listener will automatically catch this and send the official Twilio template ('ticket_resolved_custom') using this note.
             resolutionNote = parsed.messageForGuest || "Answered guest inquiry";
           }
           
           if (parsed.intent === "RESOLVE") {
             isResolving = true;
             resolutionNote = parsed.messageForGuest || "Resolved";
           }
        } catch (e) {
           console.error("AI Evaluation error:", e);
           return `I didn't quite catch that. Reply with 'RESOLVE <your message>' to close the ticket.`;
        }
      }

      if (isResolving) {
        
        // Custom logic for INVENTORY tickets
        if (activeTicket.category === "INVENTORY" && activeTicket.inventoryItemId) {
          // Look for a number in the message
          const match = messageText.match(/\d+/);
          if (!match && !mediaUrl) {
            // If they just typed RESOLVE without a number
            return `To resolve an inventory alert, please include the amount you added. Example: RESOLVE 50`;
          }
          
          if (match) {
            const addedAmount = parseInt(match[0], 10);
            
            // Increment the inventory in the database
            await prisma.inventoryItem.update({
              where: { id: activeTicket.inventoryItemId },
              data: { quantity: { increment: addedAmount } }
            });
            
            // Mark the ticket as resolved
            await prisma.ticket.update({
              where: { id: activeTicket.id },
              data: { status: "RESOLVED", resolvedAt: new Date() }
            });

            return `✅ Ticket Resolved! Added ${addedAmount} items to inventory. Thank you ${teamMember.name}!`;
          }
        }

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
            assignedToId: teamMember.id, // Assign to whoever resolved it (if it was unassigned)
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
          status: resolvedTicket.status,
          resolutionNote: resolutionNote
        });

        // If we have a custom AI staff reply (e.g. from ANSWER_AND_RESOLVE), return that. Otherwise default message.
        if (typeof parsed !== "undefined" && parsed.staffReply && parsed.intent === "ANSWER_AND_RESOLVE") {
           return parsed.staffReply;
        }

        return `🎉 Great job, ${teamMember.name}! The ticket has been resolved${mediaUrl ? ' with photo evidence' : ''}.`;
      }

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
      const isActionCommand = ["ACCEPT", "START", "RESOLVE", "COMPLETE", "DONE", "NOTED"].some(cmd => messageText.includes(cmd));
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
    
    if (messageText.includes("COMPLETE") || messageText.includes("RESOLVE") || messageText.includes("DONE") || messageText.includes("NOTED") || mediaUrl) {
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

      const { eventBus } = await import("@/lib/events/bus");
      await eventBus.emit('HOUSEKEEPING_TASK_COMPLETED', {
        taskId: activeTask.id,
        unitId: activeTask.unitId,
        propertyId: activeTask.propertyId,
        assignedToId: activeTask.assignedToId
      });

      return `🌟 Amazing work, ${teamMember.name}! Room ${activeTask.unit.name} is now marked as READY in the system${mediaUrl ? ' with photo evidence' : ''}.`;
    }

    // 5. Default Fallback
    // Only send the fallback if they sent an unrecognized command that might have been a typo,
    // or just return null to ignore normal chat messages so they can chat as a guest.
    const isActionCommand = ["ACCEPT", "START", "RESOLVE", "COMPLETE", "DONE", "NOTED"].some(cmd => messageText.includes(cmd));
    
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
