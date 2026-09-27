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
    include: { reservations: { orderBy: { checkIn: 'desc' }, take: 1 } }
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
      where: { propertyId, status: { in: ['CHECKED_IN', 'CONFIRMED'] } },
      include: { guest: true }
    });
    targetPhones = activeReservations.map(r => r.guest.phone).filter(Boolean) as string[];
  } else if (audience === "ALL_PAST_GUESTS") {
    const pastReservations = await prisma.reservation.findMany({
      where: { propertyId, status: 'CHECKED_OUT' },
      include: { guest: true }
    });
    targetPhones = Array.from(new Set(pastReservations.map(r => r.guest.phone).filter(Boolean))) as string[];
  } else if (audience === "ALL_TEAM") {
    const team = await prisma.teamMember.findMany({
      where: { propertyId, isActive: true }
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
    if (!b.relatedEntityId || !b.relatedEntityId.startsWith(propertyId + "_")) continue;
    
    const campaignName = b.relatedEntityId.substring(propertyId.length + 1);
    
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
