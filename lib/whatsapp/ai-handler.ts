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
  } else if (teamMember) {
    contextStr = `User Type: Staff/Team Member. Name: ${teamMember.name}. Role: ${teamMember.role}. Department: ${teamMember.department}. Property: ${teamMember.property.name}.`;
  }

  const systemPrompt = `You are an AI assistant for Ritumbhara Hospitality. 
You are speaking to a user via WhatsApp.
Context about this user: ${contextStr}

Your goal is to answer the user's question politely and concisely. 
If the user is reporting a maintenance issue, a complaint, or requesting an item, you MUST respond with a JSON object containing the intent to escalate. If it's a Team Member reporting an issue, look closely at their message to see if they mentioned a specific room/unit (e.g., "Room 204", "Studio 12"). Extract that unit name.
Otherwise, respond with a JSON object containing your plain text answer to the user.

IMPORTANT: Always output valid JSON in the following schema:
{
  "intent": "ANSWER_QUESTION" | "ESCALATE_ISSUE",
  "replyText": "The message to send back to the user",
  "escalationCategory": "MAINTENANCE" | "HOUSEKEEPING" | "GUEST_REQUEST" | "GUEST_COMPLAINT",
  "unitName": "Optional. The room or unit name extracted from the message, if any."
}

If intent is ESCALATE_ISSUE, replyText should assure the user that the team has been notified.
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
           description: messageText,
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
