"use server";

import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/utils/phone";

export async function getWhatsAppConversations() {
  const messages = await prisma.whatsAppMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500 // Limit for performance
  });

  // Group by phone number (ignoring our own Twilio number)
  // We don't know the exact Twilio number from process.env here easily, so we just group by whichever is NOT the system.
  // Assuming our system always sends TO guests/team, or receives FROM them.
  const threads = new Map<string, any>();

  for (const msg of messages) {
    const isOutbound = msg.direction === 'OUTBOUND';
    const otherParty = isOutbound ? msg.to : msg.from;
    const cleanPhone = normalizePhoneNumber(otherParty);

    if (!threads.has(cleanPhone)) {
      threads.set(cleanPhone, {
        phone: cleanPhone,
        originalPhone: otherParty,
        messages: [],
        lastMessageAt: msg.createdAt,
        guest: null,
        teamMember: null
      });
    }

    const thread = threads.get(cleanPhone);
    thread.messages.push(msg);
  }

  const allGuests = await prisma.guest.findMany({
    include: { reservations: { orderBy: { checkIn: 'desc' }, take: 1, include: { unit: { include: { property: true } } } } }
  });
  const allTeam = await prisma.teamMember.findMany();

  const results = Array.from(threads.values()).map(thread => {
    // Reverse messages so they are chronological
    thread.messages.reverse();

    let propertyId = null;

    // Match guest or team member
    const guestMatch = allGuests.find(g => g.phone && normalizePhoneNumber(g.phone) === thread.phone);
    if (guestMatch) {
      thread.guest = guestMatch;
      if (guestMatch.reservations.length > 0) {
        propertyId = guestMatch.reservations[0].propertyId;
      }
    }

    const teamMatch = allTeam.find(t => t.whatsappNumber && normalizePhoneNumber(t.whatsappNumber) === thread.phone);
    if (teamMatch) {
      thread.teamMember = teamMatch;
      propertyId = teamMatch.propertyId;
    }

    thread.propertyId = propertyId;

    return thread;
  });

  return results.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
}

export async function sendBroadcast(campaignName: string, audience: string, messageContent: string, propertyId: string) {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/client");
  
  let targetPhones: string[] = [];

  if (audience === "ALL_ACTIVE_GUESTS") {
    const activeReservations = await prisma.reservation.findMany({
      where: propertyId === "ALL" 
        ? { status: { in: ['CHECKED_IN', 'CONFIRMED'] } }
        : { propertyId, status: { in: ['CHECKED_IN', 'CONFIRMED'] } },
      include: { guest: true }
    });
    targetPhones = activeReservations.map(r => r.guest.phone).filter(Boolean) as string[];
  } else if (audience === "ALL_PAST_GUESTS") {
    const pastReservations = await prisma.reservation.findMany({
      where: propertyId === "ALL"
        ? { status: 'CHECKED_OUT' }
        : { propertyId, status: 'CHECKED_OUT' },
      include: { guest: true }
    });
    targetPhones = Array.from(new Set(pastReservations.map(r => r.guest.phone).filter(Boolean))) as string[];
  } else if (audience === "ALL_TEAM") {
    const team = await prisma.teamMember.findMany({
      where: propertyId === "ALL"
        ? { isActive: true }
        : { propertyId, isActive: true }
    });
    targetPhones = team.map(t => t.whatsappNumber).filter(Boolean) as string[];
  }

  // Deduplicate
  targetPhones = Array.from(new Set(targetPhones));

  if (targetPhones.length === 0) {
    return { success: false, error: "No audience found for this selection." };
  }

  let sentCount = 0;
  for (const phone of targetPhones) {
    // We prefix campaign name with property ID to keep them isolated if needed, or just use campaignName
    const finalCampaignName = `${propertyId}_${campaignName}`;
    const result = await sendWhatsAppMessage(phone, 'text', messageContent, undefined, 'BROADCAST', finalCampaignName);
    if (result.success) sentCount++;
  }

  return { success: true, count: sentCount };
}

export async function getBroadcastCampaigns(propertyId: string) {
  const broadcasts = await prisma.whatsAppMessage.findMany({
    where: { relatedEntityType: 'BROADCAST' },
    orderBy: { createdAt: 'desc' }
  });

  const campaignsMap = new Map<string, any>();
  for (const b of broadcasts) {
    let campaignName = "";
    if (propertyId === "ALL") {
      if (!b.relatedEntityId) continue;
      // Just extract the campaign name assuming format PROPERTY_CAMPAIGN or ALL_CAMPAIGN
      const parts = b.relatedEntityId.split("_");
      campaignName = parts.slice(1).join("_");
    } else {
      if (!b.relatedEntityId || !b.relatedEntityId.startsWith(propertyId + "_")) continue;
      campaignName = b.relatedEntityId.substring(propertyId.length + 1);
    }
    
    if (!campaignsMap.has(campaignName)) {
      campaignsMap.set(campaignName, {
        name: campaignName,
        sentCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        createdAt: b.createdAt
      });
    }
    const c = campaignsMap.get(campaignName);
    c.sentCount++;
    if (b.status === 'DELIVERED' || b.status === 'SANDBOX_DELIVERED') c.deliveredCount++;
    if (b.status === 'FAILED') c.failedCount++;
  }
  
  return Array.from(campaignsMap.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function sendManualMessage(phone: string, content: string) {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/client");
  // Check 24 hour window
  const lastInbound = await prisma.whatsAppMessage.findFirst({
    where: { from: phone, direction: 'INBOUND' },
    orderBy: { createdAt: 'desc' }
  });
  
  if (lastInbound) {
    const hoursSince = (new Date().getTime() - lastInbound.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      return { success: false, error: "Cannot send free-form message: 24-hour window has expired. Please use a template." };
    }
  }

  const result = await sendWhatsAppMessage(phone, 'text', content, undefined, 'MANUAL_REPLY', 'INBOX');
  return result;
}

export async function sendTemplateMessage(phone: string, templateName: string, variables: Record<string, string>) {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/client");
  let contentText = "Automated Template Sent";
  const { normalizePhoneNumber } = await import("@/lib/utils/phone");
  
  const cleanedPhone = normalizePhoneNumber(phone);
  const guests = await prisma.guest.findMany();
  const guest = guests.find(g => g.phone && normalizePhoneNumber(g.phone) === cleanedPhone);

  if (guest) {
    const reservation = await prisma.reservation.findFirst({
      where: { guestId: guest.id },
      orderBy: { checkIn: 'desc' },
      include: { unit: { include: { property: true } }, property: true }
    });

    if (templateName === 'booking_confirmation' && reservation) {
      variables = {
        '1': guest.name,
        '2': reservation.unit.name,
        '3': reservation.checkIn.toLocaleDateString(),
        '4': reservation.checkOut.toLocaleDateString(),
        '5': reservation.property?.googleMapsUrl || 'https://maps.app.goo.gl',
        '6': reservation.property?.address || 'Ritumbhara Property',
        '7': `${process.env.NEXT_PUBLIC_APP_URL || 'https://ritumbhara-hospitality-os-q6er.vercel.app'}/stay/${reservation.id}`
      };
      contentText = `Hi ${variables['1']}, Thanks for booking ${variables['2']}! We are thrilled to host you and aim to deliver a seamless 5-star experience. Quick Details: Check-in: After 1PM ${variables['3']} Check-out: Before 11AM ${variables['4']} Directions to the Studio : ${variables['5']} Address: ${variables['6']} Action Required: To ensure an uninterrupted check-in, please fill out our Guest Form here: https://forms.gle/NnCHqpCz1aj6c9T26 Manage Your Stay: Access your directions, Wi-Fi password, AI support, and housekeeping requests at your personalized Guest Portal: ${variables['7']} If you have any questions or need recommendations, just send us a message. We're here to help! Best, Ritumbhara Hospitality`;
    } else if (templateName === 'pre_arrival_instructions' && reservation) {
      variables = {
        '1': guest.name,
        '2': reservation.unit.name,
        '3': reservation.checkIn.toLocaleDateString(),
        '4': reservation.property?.wifiNetwork || 'Ritumbhara_Guest',
        '5': reservation.property?.wifiPassword || 'Ritumbhara@123',
        '6': reservation.property?.address || 'Ritumbhara Property',
        '7': reservation.property?.googleMapsUrl || 'https://maps.app.goo.gl',
        '8': `${process.env.NEXT_PUBLIC_APP_URL || 'https://ritumbhara-hospitality-os-q6er.vercel.app'}/stay/${reservation.id}`
      };
      contentText = `Hi ${variables['1']}, Your stay at ${variables['2']} is coming up! Check-in: anytime after 1PM on ${variables['3']}. Wifi: Network: ${variables['4']} Password: ${variables['5']} Action Required: Please share photos of IDs for all guests in this chat. This is required by local regulations to complete your registration. Good to know: Housekeeping: Complimentary, available in designated time slot on request. Friendly House Rules: Quiet Hours: 10PM - 8AM Smoking: Strictly NO smoking indoors Energy: Please turn off AC/lights when leaving Visitors: Only registered guests allowed overnight Delivery: For safety, delivery persons are not allowed inside. Please self-pick up orders from the Gate. Support: If you need anything, message us or use the call button! Best, Ritumbhara Hospitality`;
    } else if (templateName === 'checkout_instructions' && reservation) {
      variables = { '1': guest.name };
      contentText = `Hi ${variables['1']} We hope you enjoyed your stay with us! Just a friendly reminder that checkout is today at 11AM. To help our cleaning team prepare for the next guest, we would truly appreciate it if you could follow these quick steps before heading out: Lights & AC: Please turn off all lights and the air conditioning. Trash: Place any bagged trash in the bin Dishes: Please leave any used dishes in the sink Final Check: Double-check for any chargers or personal items! Please send us a quick message once you have officially checked out so we can give our housekeeping team a head start. Safe travels, and we hope to see you again soon! Best, Ritumbhara Hospitality`;
    } else if (templateName === 'post_stay_thank_you') {
      variables = { '1': guest.name };
      contentText = `Thank you for staying with us, ${variables['1']}! We hope you had a wonderful time. Please let us know how we did. Have a safe journey home!`;
    }
  }

  const result = await sendWhatsAppMessage(phone, 'template', contentText, templateName, 'MANUAL_TEMPLATE', 'INBOX', variables);
  return result;
}

export async function generateDraftResponse(phone: string) {
  const messages = await prisma.whatsAppMessage.findMany({
    where: {
      OR: [
        { from: phone, direction: 'INBOUND' },
        { to: phone, direction: 'OUTBOUND' }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  
  if (messages.length === 0) return { success: false, error: "No messages to base draft on." };

  // Reverse to chronological order
  messages.reverse();
  
  const conversationContext = messages.map((m: any) => `${m.direction === 'INBOUND' ? 'Guest' : 'Agent'}: ${m.content || m.templateName}`).join('\n');
  
  const { ai } = await import("@/lib/ai/groq");

  try {
    const completion = await ai.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: `You are an expert, polite front-desk agent for a luxury hotel. Draft a concise, professional reply to the guest based on the conversation history. DO NOT INCLUDE ANY PLACEHOLDERS like [Name], if you don't know the name, omit it. Do not include quotes around the response. Keep it under 2 sentences.` },
        { role: 'user', content: `Conversation history:\n${conversationContext}\n\nDraft the next Agent reply:` }
      ]
    });
    
    return { success: true, draft: completion.choices[0]?.message?.content || "" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
