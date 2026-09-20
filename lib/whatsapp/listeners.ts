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

      // MUST EXACTLY MATCH TEMPLATE 1
      const messageContent = `Hi ${guest.name}, your booking for ${unit?.unit.name} is confirmed from ${payload.checkIn.toLocaleDateString()} to ${payload.checkOut.toLocaleDateString()}. We look forward to hosting you!`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
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

      // MUST EXACTLY MATCH TEMPLATE 2
      const messageContent = `Welcome to Ritumbhara, ${guest.name}! You are now checked in. If you need anything during your stay, please reply to this message or contact the front desk. Enjoy your stay!`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
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
        'template',
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
      // Check if message already sent
      const existingMsg = await prisma.whatsAppMessage.findFirst({
        where: {
          templateName: 'pre_arrival_instructions',
          relatedEntityId: payload.reservationId,
          status: { not: 'FAILED' } // If it failed previously, we might want to retry, otherwise skip
        }
      });
      
      if (existingMsg) return;

      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      const unit = await prisma.reservation.findUnique({ 
        where: { id: payload.reservationId },
        include: { unit: true }
      });
      if (!guest?.phone) return;

      // MUST EXACTLY MATCH TEMPLATE 3
      const messageContent = `Hi ${guest.name}, we are excited to welcome you tomorrow for your stay in ${unit?.unit?.name || 'our property'}! Please remember to bring a valid government ID for check-in.`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
        messageContent,
        'pre_arrival_instructions',
        'Reservation',
        payload.reservationId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - UPCOMING_CHECK_IN]", error);
    }
  });

  // 4.5. Day of Arrival Instructions
  eventBus.on<BookingEventPayload>('TODAY_CHECK_IN', async (payload) => {
    try {
      // Check if message already sent
      const existingMsg = await prisma.whatsAppMessage.findFirst({
        where: {
          templateName: 'day_of_arrival_reminder',
          relatedEntityId: payload.reservationId,
          status: { not: 'FAILED' } 
        }
      });
      
      if (existingMsg) return;

      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      const unit = await prisma.reservation.findUnique({ 
        where: { id: payload.reservationId },
        include: { unit: { include: { property: true } } }
      });
      if (!guest?.phone) return;

      // This text MUST exactly match the new template you create in Meta Business Manager
      const messageContent = `Hi ${guest.name}, we are looking forward to your arrival today at ${unit?.unit?.property?.name || 'our property'}! Your room ${unit?.unit?.name || ''} will be ready for you. If you need directions, please reply to this message.`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
        messageContent,
        'day_of_arrival_reminder',
        'Reservation',
        payload.reservationId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - TODAY_CHECK_IN]", error);
    }
  });

  // 5. Checkout Instructions
  eventBus.on<BookingEventPayload>('UPCOMING_CHECK_OUT', async (payload) => {
    try {
      // Check if message already sent
      const existingMsg = await prisma.whatsAppMessage.findFirst({
        where: {
          templateName: 'checkout_instructions',
          relatedEntityId: payload.reservationId,
          status: { not: 'FAILED' }
        }
      });
      
      if (existingMsg) return;

      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      if (!guest?.phone) return;

      const messageContent = `Good morning, ${guest.name}! We hope you enjoyed your stay. Friendly reminder that checkout is at 11:00 AM today. Please leave the keys on the counter. Safe travels!`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
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

      // MUST EXACTLY MATCH TEMPLATE 4
      const messageContent = `NEW TICKET\nLocation: ${ticket.unit?.name || 'Property'}\nIssue: ${ticket.description}\nPriority: ${ticket.priority}\n\nReply ACCEPT to acknowledge.`;

      await sendWhatsAppMessage(
        teamMember.whatsappNumber,
        'template',
        messageContent,
        'ticket_assigned',
        'Ticket',
        payload.ticketId
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - TICKET_ASSIGNED]", error);
    }
  });

  // 7. Ticket Resolution Guest Notification
  eventBus.on<TicketEventPayload>('TICKET_RESOLVED', async (payload) => {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: payload.ticketId },
        include: { guest: true }
      });

      // Only notify if the ticket was raised by a GUEST and we have their phone
      if (ticket?.reporterType === 'GUEST' && ticket.guest?.phone) {
        
        // Prevent duplicate sending if already notified
        const existingMsg = await prisma.whatsAppMessage.findFirst({
          where: {
            templateName: 'ticket_resolved',
            relatedEntityId: ticket.id,
            status: { not: 'FAILED' }
          }
        });

        if (existingMsg) return;

        // Message MUST exactly match template configured in Meta
        const messageContent = `Hi ${ticket.guest.name}, your request "${ticket.description}" has been resolved by our team. Please let us know if you need anything else!`;

        await sendWhatsAppMessage(
          ticket.guest.phone,
          'template',
          messageContent,
          'ticket_resolved',
          'Ticket',
          ticket.id
        );
        console.log(`[WhatsApp Listener] Sent ticket_resolved notification to guest ${ticket.guest.name} for ticket ${ticket.id}`);
      }
    } catch (error) {
      console.error("[WhatsApp Listener Error - TICKET_RESOLVED]", error);
    }
  });

  // 7. SLA Breaches (Escalations)
  eventBus.on<any>('SLA_BREACHED', async (payload) => {
    try {
      const managers = await prisma.teamMember.findMany({
        where: { role: { in: ["MANAGER", "ADMIN"] }, isActive: true }
      });

      let assigneeName = "Unassigned";
      if (payload.assignedToId) {
        const assignee = await prisma.teamMember.findUnique({ where: { id: payload.assignedToId } });
        if (assignee) assigneeName = assignee.name;
      }

      const unit = payload.unitId 
        ? await prisma.unit.findUnique({ where: { id: payload.unitId } }) 
        : null;
      
      const location = unit?.name || 'Property';

      for (const manager of managers) {
        if (!manager.whatsappNumber) continue;

        // MUST EXACTLY MATCH TEMPLATE 5
        const messageContent = `SLA BREACH ALERT\nTicket: ${payload.description}\nPriority: ${payload.priority}\nLocation: ${location}\nAssigned To: ${assigneeName}\n\nImmediate management intervention required.`;

        await sendWhatsAppMessage(
          manager.whatsappNumber,
          'template',
          messageContent,
          'sla_breach_alert',
          'Ticket',
          payload.ticketId
        );
      }
    } catch (error) {
      console.error("[WhatsApp Listener Error - SLA_BREACHED]", error);
    }
  });

  console.log("[WhatsApp Listeners] Successfully initialized.");
}
