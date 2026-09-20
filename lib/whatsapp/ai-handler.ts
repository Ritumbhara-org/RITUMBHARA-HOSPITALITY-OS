import { prisma } from "@/lib/prisma";
import { ai } from "@/lib/ai/gemini";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { sendWhatsAppMessage } from "./client";
import { assignTicketRoundRobin } from "@/lib/operations/round-robin";

export async function handleGuestAIChat(senderPhone: string, messageText: string): Promise<void> {
  // 1. Identify the guest
  const guests = await prisma.guest.findMany();
  const guest = guests.find(g => g.phone && normalizePhoneNumber(g.phone) === normalizePhoneNumber(senderPhone));

  if (!guest) {
    console.log(`[AI Handler] Sender ${senderPhone} is not a registered guest.`);
    return;
  }

  // 2. Find their active or upcoming reservation
  const reservation = await prisma.reservation.findFirst({
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

  const contextStr = reservation 
    ? `Guest Name: ${guest.name}. Reservation Status: ${reservation.status}. Property: ${reservation.unit.property.name}. Unit: ${reservation.unit.name}. Check-in: ${reservation.checkIn.toLocaleDateString()}. Check-out: ${reservation.checkOut.toLocaleDateString()}.`
    : `Guest Name: ${guest.name}. No active reservation found.`;

  const systemPrompt = `You are an AI assistant for Ritumbhara Hospitality. 
You are speaking to a guest via WhatsApp.
Context about this guest: ${contextStr}

Your goal is to answer the guest's question politely and concisely. 
If the guest is reporting a maintenance issue, a complaint, or requesting an item (like extra towels), you MUST respond with a JSON object containing the intent to escalate.
Otherwise, respond with a JSON object containing your plain text answer to the guest.

IMPORTANT: Always output valid JSON in the following schema:
{
  "intent": "ANSWER_QUESTION" | "ESCALATE_ISSUE",
  "replyText": "The message to send back to the guest",
  "escalationCategory": "MAINTENANCE" | "HOUSEKEEPING" | "GUEST_REQUEST" | "GUEST_COMPLAINT"
}

If intent is ESCALATE_ISSUE, replyText should assure the guest that our team has been notified.
`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: messageText,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      }
    });

    const responseText = result.text;
    if (!responseText) return;

    const parsed = JSON.parse(responseText);

    if (parsed.intent === "ESCALATE_ISSUE" && reservation) {
       // Calculate SLAs
       const slaDeadline = new Date();
       const responseSlaDeadline = new Date();
       // Default to MEDIUM for AI tickets
       slaDeadline.setHours(slaDeadline.getHours() + 24); 
       responseSlaDeadline.setMinutes(responseSlaDeadline.getMinutes() + 30);

       // Create a ticket!
       const ticket = await prisma.ticket.create({
         data: {
           description: messageText,
           priority: "MEDIUM",
           status: "OPEN",
           category: parsed.escalationCategory || "GUEST_REQUEST",
           reporterType: "GUEST",
           reporterId: guest.id,
           guestId: guest.id,
           propertyId: reservation.unit.propertyId,
           unitId: reservation.unitId,
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
