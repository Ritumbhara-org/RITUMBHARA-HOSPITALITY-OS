import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events/bus";

export async function processDailyAutomations() {
  console.log("[Cron] Starting daily automation engine...");
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  // 1. Pre-arrival messages (Check-in is tomorrow)
  const upcomingCheckIns = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      checkIn: {
        gte: tomorrow,
        lt: dayAfterTomorrow
      }
    }
  });

  console.log(`[Cron] Found ${upcomingCheckIns.length} reservations checking in tomorrow.`);
  for (const res of upcomingCheckIns) {
    await eventBus.emit('UPCOMING_CHECK_IN', {
      reservationId: res.id,
      guestId: res.guestId,
      propertyId: res.propertyId,
      intellistayBookingId: res.intellistayReservationId || "direct",
      status: res.status,
      checkIn: res.checkIn,
      checkOut: res.checkOut
    });
  }

  // 2. Checkout Instructions (Check-out is today)
  const upcomingCheckOuts = await prisma.reservation.findMany({
    where: {
      status: "CHECKED_IN",
      checkOut: {
        gte: today,
        lt: tomorrow
      }
    }
  });

  console.log(`[Cron] Found ${upcomingCheckOuts.length} reservations checking out today.`);
  for (const res of upcomingCheckOuts) {
    await eventBus.emit('UPCOMING_CHECK_OUT', {
      reservationId: res.id,
      guestId: res.guestId,
      propertyId: res.propertyId,
      intellistayBookingId: res.intellistayReservationId || "direct",
      status: res.status,
      checkIn: res.checkIn,
      checkOut: res.checkOut
    });
  }

  console.log("[Cron] Daily automations finished.");
  return {
    preArrivals: upcomingCheckIns.length,
    checkouts: upcomingCheckOuts.length
  };
}
