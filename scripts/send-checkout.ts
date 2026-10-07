import { prisma } from '../lib/prisma.ts';
import { sendWhatsAppMessage } from '../lib/whatsapp/client.ts';

async function run() {
  const today = new Date('2026-10-07T00:00:00Z');
  const tomorrow = new Date('2026-10-08T00:00:00Z');
  const res = await prisma.reservation.findMany({
    where: { 
      status: 'CHECKED_OUT', 
      checkOut: { gte: today, lt: tomorrow } 
    },
    include: { guest: true }
  });
  console.log('Found', res.length, 'reservations checking out today');
  for (const r of res) {
    if (!r.guest.phone) continue;
    console.log('Sending to', r.guest.name, r.guest.phone);
    const msg = `Thank you for staying with us, ${r.guest.name}! We hope you had a wonderful time. Please let us know how we did. Have a safe journey home!`;
    await sendWhatsAppMessage(r.guest.phone, 'template', msg, 'post_stay_thank_you', 'Reservation', r.id, { '1': r.guest.name });
  }
}
run().catch(console.error);
