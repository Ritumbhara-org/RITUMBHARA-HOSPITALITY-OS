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

  console.log("[WhatsApp Listeners] Successfully initialized.");
}
