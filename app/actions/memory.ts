"use server";
import { prisma } from "@/lib/prisma";
import { ai } from "@/lib/ai/groq";
import { normalizePhoneNumber } from "@/lib/utils/phone";

export async function summarizeUserMemory(phone: string) {
  try {
    const cleanPhone = normalizePhoneNumber(phone);
    
    // Find guest or team member
    const guests = await prisma.guest.findMany();
    const guest = guests.find(g => g.phone && normalizePhoneNumber(g.phone) === cleanPhone);

    const teamMembers = await prisma.teamMember.findMany();
    const teamMember = teamMembers.find(t => t.whatsappNumber && normalizePhoneNumber(t.whatsappNumber) === cleanPhone);

    if (!guest && !teamMember) {
      return { success: false, error: "User not found." };
    }

    // Get all messages for this phone
    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        OR: [
          { from: { contains: cleanPhone } },
          { to: { contains: cleanPhone } }
        ]
      },
      orderBy: { createdAt: 'asc' },
      take: 100
    });

    if (messages.length === 0) {
      return { success: false, error: "No messages to summarize." };
    }

    const transcript = messages.map(m => `${m.direction === 'INBOUND' ? 'User' : 'System/Agent'}: ${m.content}`).join('\n');
    
    const existingContext = guest ? guest.aiContext : teamMember?.aiContext;

    const prompt = `You are an AI tasked with updating the permanent memory context for a user in a hotel system.
Here is what you currently know about them:
${existingContext || "Nothing."}

Here is their recent chat transcript:
${transcript}

Based ONLY on this transcript, write an updated, concise summary of this user. Include any preferences they stated, issues they faced (and if they were resolved), and important facts. Keep it under 3-4 sentences. Do not include conversational pleasantries, just hard facts.`;

    const chatCompletion = await ai.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "openai/gpt-oss-120b"
    });

    const newContext = chatCompletion.choices[0]?.message?.content || "";

    if (guest) {
      await prisma.guest.update({ where: { id: guest.id }, data: { aiContext: newContext } });
    } else if (teamMember) {
      await prisma.teamMember.update({ where: { id: teamMember.id }, data: { aiContext: newContext } });
    }

    return { success: true, newContext };
  } catch (error: any) {
    console.error("[Memory Summarization Error]", error);
    return { success: false, error: error.message };
  }
}

export async function draftAIReply(phone: string, recentMessages: string[]) {
  try {
    const cleanPhone = normalizePhoneNumber(phone);
    const guests = await prisma.guest.findMany();
    const guest = guests.find(g => g.phone && normalizePhoneNumber(g.phone) === cleanPhone);

    const context = guest?.aiContext || "No background context available.";
    
    const prompt = `You are an AI agent for a hotel. Draft a polite, concise reply to the user.
User Context: ${context}

Recent messages:
${recentMessages.join('\n')}

Draft the next reply:`;

    const chatCompletion = await ai.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "openai/gpt-oss-120b"
    });

    return { success: true, draft: chatCompletion.choices[0]?.message?.content || "" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
