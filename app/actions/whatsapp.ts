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
