import { eventBus, BookingEventPayload, TicketEventPayload } from "@/lib/events/bus";
import { sendWhatsAppMessage } from "./client";
import { prisma } from "@/lib/prisma";

export function initWhatsAppListeners() {
  // 1. Booking Confirmation / Pre-arrival
  eventBus.on<BookingEventPayload>('BOOKING_CREATED', async (payload) => {
    try {
      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } });
      const unit = await prisma.reservation.findUnique({ 
        where: { id: payload.reservationId },
        include: { unit: { include: { property: true } } }
      });

      if (!guest?.phone) return;

      const messageContent = `Hi ${guest.name},

Thanks for booking ${unit?.unit.name}! We are thrilled to host you and aim to deliver a seamless 5-star experience.

Quick Details:

Check-in: After 1PM ${payload.checkIn.toLocaleDateString()}
Check-out: Before 11AM ${payload.checkOut.toLocaleDateString()}
Directions the Studio : https://maps.app.goo.gl
Address: ${unit?.unit.property?.address || 'Ritumbhara Property'}

Action Required:
To ensure an uninterrupted check-in, please fill out our Guest Form here: https://forms.gle/NnCHqpCz1aj6c9T26

Planning Your Trip:
Feel free to browse our curated Guidebook https://ritumbhara.com/guide for our favorite local spots and hidden gems.

If you have any questions or need recommendations, just send us a message. We're here to help!

Best,
Ritumbhara Hospitality`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
        messageContent,
        'booking_confirmation',
        'Reservation',
        payload.reservationId,
        {
          '1': guest.name,
          '2': unit?.unit.name || 'our property',
          '3': payload.checkIn.toLocaleDateString(),
          '4': payload.checkOut.toLocaleDateString(),
          '5': unit?.unit.property?.googleMapsUrl || 'https://maps.app.goo.gl',
          '6': unit?.unit.property?.address || 'Ritumbhara Property',
          '7': 'https://ritumbhara.com/guide'
        }
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - BOOKING_CREATED]", error);
    }
  });

  // (Skipped GUEST_CHECKED_IN / check_in_welcome per CEO)
  
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
        payload.reservationId,
        { '1': guest.name }
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

      const messageContent = `Hi ${guest.name},

Your stay at ${unit?.unit?.name || 'our property'} is coming up! Check-in: anytime after 1PM on ${payload.checkIn.toLocaleDateString()}.

Location:
Address: Ritumbhara Property
Map: https://maps.app.goo.gl

Wifi:
Network: Ritumbhara_Guest
Password: Ritumbhara@123

Action Required: Please share photos of IDs for all guests in this chat. This is required by local regulations to complete your registration.

Good to know:
Housekeeping: Complimentary, available in designated time slot on request.

Friendly House Rules:
- Quiet Hours: 10PM - 8AM
- Smoking: Strictly NO smoking indoors
- Energy: Please turn off AC/lights when leaving
- Visitors: Only registered guests allowed overnight
- Delivery: For safety, delivery persons are not allowed inside. Please self-pick up orders from the Gate.

Support: If you need anything, message us or use the call button!

Best, Ritumbhara Hospitality`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
        messageContent,
        'pre_arrival_instructions',
        'Reservation',
        payload.reservationId,
        {
          '1': guest.name,
          '2': unit?.unit?.name || 'our property',
          '3': payload.checkIn.toLocaleDateString(),
          '4': unit?.unit?.property?.wifiNetwork || 'Ritumbhara_Guest',
          '5': unit?.unit?.property?.wifiPassword || 'Ritumbhara@123',
          '6': unit?.unit?.property?.address || 'Ritumbhara Property',
          '7': unit?.unit?.property?.googleMapsUrl || 'https://maps.app.goo.gl'
        }
      );
    } catch (error) {
      console.error("[WhatsApp Listener Error - UPCOMING_CHECK_IN]", error);
    }
  });

  // (Skipping TODAY_CHECK_IN / day_of_arrival_reminder as per CEO request - rely on pre_arrival_instructions)

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

      const messageContent = `Hi ${guest.name}

We hope you enjoyed your stay with us! Just a friendly reminder that checkout is today at 11:00 AM

To help our cleaning team prepare for the next guest, we would truly appreciate it if you could follow these quick steps before heading out:

Lights & AC: Please turn off all lights and the air conditioning.

Trash: Place any bagged trash in the bin

Dishes: Please leave any used dishes in the sink

Final Check: Double-check for any chargers or personal items!

Please send us a quick message once you have officially checked out so we can give our housekeeping team a head start.

Safe travels, and we hope to see you again soon!

Best,
Ritumbhara Hospitality`;

      await sendWhatsAppMessage(
        guest.phone,
        'template',
        messageContent,
        'checkout_instructions',
        'Reservation',
        payload.reservationId,
        { 
          '1': guest.name
        }
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
        payload.ticketId,
        {
          '1': ticket.unit?.name || 'Property',
          '2': ticket.description,
          '3': ticket.priority
        }
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
          ticket.id,
          {
            '1': ticket.guest.name,
            '2': ticket.description
          }
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
          payload.ticketId,
          {
            '1': payload.description,
            '2': payload.priority,
            '3': location,
            '4': assigneeName
          }
        );
      }
    } catch (error) {
      console.error("[WhatsApp Listener Error - SLA_BREACHED]", error);
    }
  });

  console.log("[WhatsApp Listeners] Successfully initialized.");
}
