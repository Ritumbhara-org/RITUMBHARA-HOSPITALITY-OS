import { prisma } from "../lib/prisma";
import { eventBus } from "../lib/events/bus";
import { initWhatsAppListeners } from "../lib/whatsapp/listeners";

async function run() {
  console.log("Initializing WhatsApp Listeners...");
  initWhatsAppListeners();

  console.log("Fetching all CONFIRMED reservations...");
  const confirmedReservations = await prisma.reservation.findMany({
    where: {
      status: 'CONFIRMED'
    },
    include: {
      guest: true
    }
  });

  console.log(`Found ${confirmedReservations.length} confirmed reservations. Starting to send messages...`);

  let successCount = 0;
  for (const res of confirmedReservations) {
    try {
      if (!res.guest.phone || res.guest.phone === '0000000000') {
        console.log(`Skipping reservation ${res.id} - Invalid phone number`);
        continue;
      }

      await eventBus.emit('BOOKING_CREATED', {
        reservationId: res.id,
        guestId: res.guestId,
        propertyId: res.propertyId,
        intellistayBookingId: res.intellistayReservationId || undefined,
        status: res.status,
        checkIn: res.checkIn,
        checkOut: res.checkOut
      });

      console.log(`Triggered BOOKING_CREATED for reservation ${res.id} (Guest: ${res.guest.name})`);
      successCount++;

      // Sleep for a bit to avoid rate limiting from Twilio
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e: any) {
      console.error(`Error processing reservation ${res.id}: ${e.message}`);
    }
  }

  console.log(`Finished sending confirmations! Successfully triggered ${successCount} messages.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
