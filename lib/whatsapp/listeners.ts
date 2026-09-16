import { eventBus, BookingEventPayload } from "@/lib/events/bus";
import { sendWhatsAppMessage } from "./client";
import { prisma } from "@/lib/prisma";

export function initWhatsAppListeners() {
  // 1. Booking Confirmation / Pre-arrival
  eventBus.on<BookingEventPayload>('BOOKING_CREATED', async (payload) => {
    try {
      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      const unit = await prisma.reservation.findUnique({ 
        where: { id: payload.reservationId },
        include: { unit: true }
      });

      if (!guest?.phone) return;

      const messageContent = `Hi ${guest.name}, your booking for ${unit?.unit.name} is confirmed from ${payload.checkIn.toLocaleDateString()} to ${payload.checkOut.toLocaleDateString()}. We look forward to hosting you!`;

      await sendWhatsAppMessage(
        guest.phone,
        'text', // Assuming text for sandbox, would be 'template' in prod
        messageContent,
        'booking_confirmation',
        'Reservation',
        payload.reservationId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - BOOKING_CREATED]", error);
    }
  });

  // 2. Check-in Instructions
  eventBus.on<BookingEventPayload>('GUEST_CHECKED_IN', async (payload) => {
    try {
      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      if (!guest?.phone) return;

      const messageContent = `Welcome to Ritumbhara, ${guest.name}! You are now checked in. If you need anything during your stay, please reply to this message or contact the front desk. Enjoy your stay!`;

      await sendWhatsAppMessage(
        guest.phone,
        'text',
        messageContent,
        'check_in_welcome',
        'Reservation',
        payload.reservationId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - GUEST_CHECKED_IN]", error);
    }
  });

  // 3. Post-stay / Review
  eventBus.on<BookingEventPayload>('GUEST_CHECKED_OUT', async (payload) => {
    try {
      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      if (!guest?.phone) return;

      const messageContent = `Thank you for staying with us, ${guest.name}! We hope you had a wonderful time. Please let us know how we did. Have a safe journey home!`;

      await sendWhatsAppMessage(
        guest.phone,
        'text',
        messageContent,
        'post_stay_thank_you',
        'Reservation',
        payload.reservationId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - GUEST_CHECKED_OUT]", error);
    }
  });

  // 4. Pre-arrival Instructions
  eventBus.on<BookingEventPayload>('UPCOMING_CHECK_IN', async (payload) => {
    try {
      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      const unit = await prisma.reservation.findUnique({ 
        where: { id: payload.reservationId },
        include: { unit: true }
      });
      if (!guest?.phone) return;

      const messageContent = `Hi ${guest.name}, we are excited to welcome you tomorrow for your stay in ${unit?.unit.name}! Please remember to bring a valid government ID for check-in. Here is our location pin: [Google Maps Link]`;

      await sendWhatsAppMessage(
        guest.phone,
        'text',
        messageContent,
        'pre_arrival_instructions',
        'Reservation',
        payload.reservationId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - UPCOMING_CHECK_IN]", error);
    }
  });

  // 5. Checkout Instructions
  eventBus.on<BookingEventPayload>('UPCOMING_CHECK_OUT', async (payload) => {
    try {
      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      if (!guest?.phone) return;

      const messageContent = `Good morning, ${guest.name}! We hope you enjoyed your stay. Friendly reminder that checkout is at 11:00 AM today. Please leave the keys on the counter. Safe travels!`;

      await sendWhatsAppMessage(
        guest.phone,
        'text',
        messageContent,
        'checkout_instructions',
        'Reservation',
        payload.reservationId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - UPCOMING_CHECK_OUT]", error);
    }
  });

  // 6. Ticket Assignments
  eventBus.on<any>('TICKET_ASSIGNED', async (payload) => {
    try {
      if (!payload.assignedToId) return;
      
      const teamMember = await prisma.teamMember.findUnique({ where: { id: payload.assignedToId } });
      const ticket = await prisma.ticket.findUnique({ 
        where: { id: payload.ticketId },
        include: { unit: true }
      });
      
      if (!teamMember?.whatsappNumber || !ticket) return;

      const priorityLabel = ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH' ? `[${ticket.priority}] ` : '';
      const messageContent = `🔧 NEW TICKET ${priorityLabel}\nLocation: ${ticket.unit?.name || 'Property'}\nIssue: ${ticket.description}\n\nReply 'ACCEPT' to acknowledge.`;

      await sendWhatsAppMessage(
        teamMember.whatsappNumber,
        'text',
        messageContent,
        'ticket_assigned',
        'Ticket',
        payload.ticketId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - TICKET_ASSIGNED]", error);
    }
  });

  console.log("[WhatsApp Listeners] Successfully initialized.");
}
