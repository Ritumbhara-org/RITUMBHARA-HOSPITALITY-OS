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
  const checkInPromises = upcomingCheckIns.map(res => 
    eventBus.emit('UPCOMING_CHECK_IN', {
      reservationId: res.id,
      guestId: res.guestId,
      propertyId: res.propertyId,
      intellistayBookingId: res.intellistayReservationId || "direct",
      status: res.status,
      checkIn: res.checkIn,
      checkOut: res.checkOut
    })
  );
  await Promise.allSettled(checkInPromises);

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
  const checkOutPromises = upcomingCheckOuts.map(res => 
    eventBus.emit('UPCOMING_CHECK_OUT', {
      reservationId: res.id,
      guestId: res.guestId,
      propertyId: res.propertyId,
      intellistayBookingId: res.intellistayReservationId || "direct",
      status: res.status,
      checkIn: res.checkIn,
      checkOut: res.checkOut
    })
  );
  await Promise.allSettled(checkOutPromises);

  console.log("[Cron] Daily automations finished.");
  return {
    preArrivals: upcomingCheckIns.length,
    checkouts: upcomingCheckOuts.length
  };
}

export async function checkSlaBreaches() {
  console.log("Checking for SLA breaches...");
  
  try {
    const now = new Date();
    
    const breachedTickets = await prisma.ticket.findMany({
      where: {
        status: { notIn: ["RESOLVED", "CLOSED", "ESCALATED"] },
        slaDeadline: { lt: now }
      },
      include: {
        unit: true
      }
    });

    console.log(`[Cron] Found ${breachedTickets.length} breached tickets`);

    for (const ticket of breachedTickets) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "ESCALATED",
          auditLogs: {
            create: {
              action: "TICKET_ESCALATED",
              actorId: "system",
              actorType: "MANAGEMENT",
              toStatus: "ESCALATED",
              notes: "Automated SLA breach escalation"
            }
          }
        }
      });

      await eventBus.emit('SLA_BREACHED', {
        ticketId: ticket.id,
        description: ticket.description,
        priority: ticket.priority,
        assignedToId: ticket.assignedToId,
        unitId: ticket.unitId,
        slaDeadline: ticket.slaDeadline
      });
    }

  } catch (error) {
    console.error("[Cron Error] Error checking SLA breaches:", error);
  }
}
