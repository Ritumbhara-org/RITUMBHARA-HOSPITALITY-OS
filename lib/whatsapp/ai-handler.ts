import { prisma } from "@/lib/prisma";
import { ai } from "@/lib/ai/groq";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { sendWhatsAppMessage } from "./client";
import { assignTicketRoundRobin } from "@/lib/operations/round-robin";

export async function handleGuestAIChat(senderPhone: string, messageText: string): Promise<void> {
  // 1. Identify if it's a Guest or Team Member
  const cleanedPhone = normalizePhoneNumber(senderPhone);
  
  const guests = await prisma.guest.findMany();
  const guest = guests.find(g => g.phone && normalizePhoneNumber(g.phone) === cleanedPhone);

  const teamMembers = await prisma.teamMember.findMany({ include: { property: true } });
  const teamMember = teamMembers.find(t => t.whatsappNumber && normalizePhoneNumber(t.whatsappNumber) === cleanedPhone);

  if (!guest && !teamMember) {
    console.log(`[AI Handler] Sender ${senderPhone} is not a registered guest or team member.`);
    return;
  }

  let contextStr = "";
  let reservation = null;

  if (guest) {
    // Find their active or upcoming reservation
    reservation = await prisma.reservation.findFirst({
      where: {
        guestId: guest.id,
        status: { in: ["CONFIRMED", "CHECKED_IN"] }
      },
      orderBy: { checkIn: 'asc' },
      include: {
        unit: {
          include: { property: true }
        }
      }
    });

    contextStr = reservation 
      ? `User Type: Guest. Guest Name: ${guest.name}. Reservation Status: ${reservation.status}. Property: ${reservation.unit.property.name}. Unit: ${reservation.unit.name}. Check-in: ${reservation.checkIn.toLocaleDateString()}. Check-out: ${reservation.checkOut.toLocaleDateString()}.`
      : `User Type: Guest. Guest Name: ${guest.name}. No active reservation found.`;

    // Fetch recent resolved tickets
    const recentTickets = await prisma.ticket.findMany({
      where: { guestId: guest.id, status: { in: ["RESOLVED", "CLOSED", "OPEN", "IN_PROGRESS", "ASSIGNED"] } },
      orderBy: { updatedAt: 'desc' },
      take: 3
    });
    
    if (recentTickets.length > 0) {
      contextStr += `\nRecent Tickets for this user:\n` + recentTickets.map(t => `- ID: ${t.id} | Status: ${t.status} | Issue: ${t.description}`).join('\n');
    }
  } else if (teamMember) {
    contextStr = `User Type: Staff/Team Member. Name: ${teamMember.name}. Role: ${teamMember.role}. Department: ${teamMember.department}. Property: ${teamMember.property.name}.`;
  }

  // Get current hour in IST
  const istDateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istDateStr);
  const istHour = istDate.getHours();
  const isOutOfHours = istHour >= 22 || istHour < 10;
  
  let availabilityRules = "";
  if (isOutOfHours) {
    availabilityRules = `\nCRITICAL RULE: If your intent is ESCALATE_ISSUE or REOPEN_ISSUE, you MUST explicitly append this to your replyText: "As this is outside our working hours, all our staff are currently offline. However, we have notified them. If this is an emergency and needs to be resolved immediately, please contact 9503002629." Do NOT include this warning if your intent is ANSWER_QUESTION.`;
  } else {
    availabilityRules = `\nCRITICAL RULE: If your intent is ESCALATE_ISSUE, you MUST append this sentence to your replyText: "If no one responds to your request within 10 minutes, please contact 9503002629 for direct assistance."`;
  }

  const systemPrompt = `You are an AI assistant for Ritumbhara Hospitality. 
You are speaking to a user via WhatsApp.
Context about this user: ${contextStr}
${availabilityRules}

Your goal is to answer the user's question politely and concisely. 
If the user is reporting a CLEAR and ACTIONABLE new maintenance issue, a complaint, requesting an item, or making a request that requires human approval (like early check-in, late check-out, or room upgrades), you MUST respond with intent "ESCALATE_ISSUE".
If the user's message is just a greeting, a brief statement, ambiguous (e.g., just a room number), or just sharing information WITHOUT explicitly asking for assistance, DO NOT escalate. Respond with intent "ANSWER_QUESTION" and reply naturally.
If the user is complaining that a previously resolved/closed issue is STILL NOT FIXED (refer to Recent Tickets context), you MUST respond with intent "REOPEN_ISSUE" and include the specific "ticketId".
If it's a Team Member reporting an issue, look closely at their message to see if they mentioned a specific room/unit (e.g., "Room 204", "Studio 12"). Extract that unit name.
Otherwise, respond with intent "ANSWER_QUESTION" containing your plain text answer to the user.

IMPORTANT: Always output valid JSON in the following schema:
{
  "intent": "ANSWER_QUESTION" | "ESCALATE_ISSUE" | "REOPEN_ISSUE",
  "replyText": "The message to send back to the user",
  "escalationCategory": "GUEST_REQUEST" | "HOUSEKEEPING" | "MAINTENANCE" | "GUEST_COMPLAINT" | null,
  "unitName": "Optional. The room or unit name extracted from the message, if any.",
  "ticketId": "Optional. The ID of the ticket to reopen if intent is REOPEN_ISSUE.",
  "ticketDescription": "Optional. If intent is ESCALATE_ISSUE, provide a clear, concise, generalized summary of the issue (e.g. 'Guest requested a cooker for the kitchen'). Do NOT just copy the user's raw message."
}

CRITICAL CATEGORIZATION RULES FOR ESCALATION_CATEGORY:
1. If the request is about check-in, check-out, late check-out, early check-in, payments, room upgrades, keys, or general reception inquiries -> You MUST use "GUEST_REQUEST" (This assigns it to Front Desk).
2. If the request is about cleaning, towels, bedsheets, room service, or missing inventory -> You MUST use "HOUSEKEEPING".
3. If the request is about broken items, AC not working, plumbing, TV issues -> You MUST use "MAINTENANCE".

If intent is ESCALATE_ISSUE or REOPEN_ISSUE, replyText should assure the user that the team has been notified and will check into it.
`;

  try {
    const chatCompletion = await ai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageText }
      ],
      model: "openai/gpt-oss-120b",
      response_format: { type: "json_object" },
    });

    const responseText = chatCompletion.choices[0]?.message?.content;
    if (!responseText) return;

    const parsed = JSON.parse(responseText);

    if (parsed.intent === "ESCALATE_ISSUE" && (reservation || teamMember)) {
       // Calculate SLAs
       const slaDeadline = new Date();
       const responseSlaDeadline = new Date();
       // Default to MEDIUM for AI tickets
       slaDeadline.setHours(slaDeadline.getHours() + 24); 
       responseSlaDeadline.setMinutes(responseSlaDeadline.getMinutes() + 30);

       let propertyId = "";
       let unitId = null;

       if (guest && reservation) {
         propertyId = reservation.unit.propertyId;
         unitId = reservation.unitId;
       } else if (teamMember) {
         propertyId = teamMember.propertyId;
         if (parsed.unitName) {
           const unit = await prisma.unit.findFirst({
             where: { propertyId: propertyId, name: { contains: parsed.unitName, mode: 'insensitive' } }
           });
           if (unit) unitId = unit.id;
         }
       }

       // Create a ticket!
       const ticket = await prisma.ticket.create({
         data: {
           description: parsed.ticketDescription || messageText,
           priority: "MEDIUM",
           status: "OPEN",
           category: parsed.escalationCategory || "GUEST_REQUEST",
           reporterType: guest ? "GUEST" : "TEAM",
           reporterId: guest ? guest.id : (teamMember ? teamMember.id : "unknown"),
           guestId: guest ? guest.id : null,
           propertyId: propertyId,
           unitId: unitId,
           slaDeadline,
           responseSlaDeadline
         }
       });
       
       // Automatically assign it to a team member in round-robin
       await assignTicketRoundRobin(ticket.id);
    } else if (parsed.intent === "REOPEN_ISSUE" && parsed.ticketId) {
       const existingTicket = await prisma.ticket.findUnique({ where: { id: parsed.ticketId } });
       if (existingTicket) {
         await prisma.ticket.update({
           where: { id: existingTicket.id },
           data: { 
             status: "REOPENED", 
             resolvedAt: null,
             auditLogs: {
               create: {
                 action: "STATUS_CHANGED_TO_REOPENED",
                 actorId: guest ? guest.id : (teamMember ? teamMember.id : "system"),
                 actorType: guest ? "GUEST" : (teamMember ? "TEAM" : "SYSTEM"),
                 toStatus: "REOPENED",
                 notes: `Reopened by user via AI chat: ${messageText}`
               }
             }
           }
         });

         const { eventBus } = await import("@/lib/events/bus");
         await eventBus.emit('TICKET_UPDATED', {
           ticketId: existingTicket.id,
           assignedToId: existingTicket.assignedToId || undefined,
           propertyId: existingTicket.propertyId,
           unitId: existingTicket.unitId,
           priority: existingTicket.priority,
           status: "REOPENED"
         });
       }
    }

    if (parsed.replyText) {
      await sendWhatsAppMessage(
         senderPhone,
         'text',
         parsed.replyText
      );
    }
  } catch (error: any) {
    console.error("[AI Chat Handler Error]", error.message);
    
    // Fallback response for the demo if Gemini API is blocked or fails
    await sendWhatsAppMessage(
       senderPhone,
       'text',
       "Hello! I am your AI assistant. (Note: My AI brain is currently disconnected due to an API key restriction, but our human team is here for you!)"
    );
  }
}
