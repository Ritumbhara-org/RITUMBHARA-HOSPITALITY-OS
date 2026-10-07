import { prisma } from '../lib/prisma.ts';
import { sendWhatsAppMessage } from '../lib/whatsapp/client.ts';

async function run() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all upcoming confirmed reservations
  const res = await prisma.reservation.findMany({
    where: { 
      status: 'CONFIRMED', 
      checkIn: { gte: today } 
    },
    include: { 
      guest: true,
      unit: { include: { property: true } }
    }
  });

  console.log(`Found ${res.length} upcoming confirmed reservations.`);
  let sentCount = 0;

  for (const r of res) {
    if (!r.guest.phone) continue;

    // Check if booking_confirmation was already sent
    const existingMsg = await prisma.whatsAppMessage.findFirst({
      where: {
        templateName: 'booking_confirmation',
        relatedEntityId: r.id,
        status: { not: 'FAILED' }
      }
    });

    if (existingMsg) {
      console.log(`Already sent confirmation to ${r.guest.name} for ${r.id}, skipping...`);
      continue;
    }

    console.log(`Sending booking_confirmation to ${r.guest.name} ${r.guest.phone}`);
    const messageContent = `Hi ${r.guest.name},
Thanks for booking ${r.unit?.name || 'our property'}! We are thrilled to host you and aim to deliver a seamless 5-star experience.
...`; // Message content gets replaced by Twilio anyway

    await sendWhatsAppMessage(
      r.guest.phone,
      'template',
      messageContent,
      'booking_confirmation',
      'Reservation',
      r.id,
      { '1': r.guest.name }
    );
    sentCount++;
  }
  console.log(`Finished sending ${sentCount} booking confirmations!`);
}

run().catch(console.error);
