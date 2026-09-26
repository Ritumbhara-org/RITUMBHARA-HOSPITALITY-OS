import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events/bus";

export async function processAutoCheckinCheckout() {
  const now = new Date();
  
  // Format the current time in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kolkata', 
    year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', hour12: false 
  });
  
  const parts = formatter.formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  
  // p.hour can be '24' in some environments when hour12=false, standardize to 0-23
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0;

  const localDateStr = `${p.year}-${p.month}-${p.day}`; // YYYY-MM-DD
  
  let checkedInCount = 0;
  let checkedOutCount = 0;

  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'CHECKED_IN'] }
      },
      include: {
        guest: true
      }
    });

    for (const res of reservations) {
      if (res.status === 'CONFIRMED') {
        // The checkIn date in DB is UTC, but typically stored as YYYY-MM-DD at 00:00:00Z.
        // We'll extract the UTC date string as YYYY-MM-DD.
        const checkInStr = `${res.checkIn.getUTCFullYear()}-${String(res.checkIn.getUTCMonth()+1).padStart(2,'0')}-${String(res.checkIn.getUTCDate()).padStart(2,'0')}`;

        const isTodayCheckIn = (localDateStr === checkInStr);
        const isPastCheckInDate = (localDateStr > checkInStr);

        // Auto check-in if past 1 PM (13:00) on the checkIn date, or if the date has entirely passed
        if ((isTodayCheckIn && hour >= 13) || isPastCheckInDate) {
          await prisma.reservation.update({
            where: { id: res.id },
            data: { status: 'CHECKED_IN' }
          });
          
          eventBus.emit('GUEST_CHECKED_IN', {
             reservationId: res.id,
             guestId: res.guestId,
             checkIn: res.checkIn,
             checkOut: res.checkOut,
             status: 'CHECKED_IN'
          });
          checkedInCount++;
          console.log(`[Auto Status] Checked IN reservation ${res.id}`);
        }
      }

      if (res.status === 'CHECKED_IN') {
        const checkOutStr = `${res.checkOut.getUTCFullYear()}-${String(res.checkOut.getUTCMonth()+1).padStart(2,'0')}-${String(res.checkOut.getUTCDate()).padStart(2,'0')}`;

        const isTodayCheckOut = (localDateStr === checkOutStr);
        const isPastCheckOutDate = (localDateStr > checkOutStr);

        // Auto check-out if past 11 AM (11:00) on the checkOut date, or if the date has entirely passed
        if ((isTodayCheckOut && hour >= 11) || isPastCheckOutDate) {
          await prisma.reservation.update({
            where: { id: res.id },
            data: { status: 'CHECKED_OUT' }
          });
          
          eventBus.emit('GUEST_CHECKED_OUT', {
             reservationId: res.id,
             guestId: res.guestId,
             checkIn: res.checkIn,
             checkOut: res.checkOut,
             status: 'CHECKED_OUT'
          });
          checkedOutCount++;
          console.log(`[Auto Status] Checked OUT reservation ${res.id}`);
        }
      }
    }

    return { success: true, checkedInCount, checkedOutCount };
  } catch (error: any) {
    console.error("[Auto Status] Error processing auto checkin/checkout:", error);
    return { success: false, error: error.message };
  }
}
