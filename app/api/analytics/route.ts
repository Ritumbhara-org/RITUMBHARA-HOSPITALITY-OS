import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, differenceInDays } from "date-fns";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get("propertyId");
    const timeframe = url.searchParams.get("timeframe") || "This Month";
    
    // Timeframes
    const now = new Date();
    let startDate = startOfMonth(now);
    let endDate = endOfMonth(now);

    if (timeframe === "Last Month") {
      const lastMonth = subMonths(now, 1);
      startDate = startOfMonth(lastMonth);
      endDate = endOfMonth(lastMonth);
    } else if (timeframe === "Year to Date") {
      startDate = startOfYear(now);
      endDate = endOfYear(now);
    }

    const whereProperty = propertyId ? { propertyId } : {};
    const whereUnitProperty = propertyId ? { propertyId } : {};
    const whereTicketProperty = propertyId ? { propertyId } : {};

    // Execute queries in parallel to drastically speed up first load
    const [
      reservations,
      totalUnits,
      openTicketsCount,
      completedTicketsCount,
      overdueTicketsCount,
      maintenanceTickets,
      completedHousekeeping,
      guestsWithCounts,
      members,
      whatsappEngagement
    ] = await Promise.all([
      // 1. REVENUE METRICS
      prisma.reservation.findMany({
        where: {
          ...whereProperty,
          checkIn: { gte: startDate, lte: endDate },
          status: { not: "CANCELLED" }
        },
        select: { checkIn: true, checkOut: true, totalAmount: true, source: true }
      }),
      // Total Units
      prisma.unit.count({ where: whereUnitProperty }),
      // 2. OPERATIONS METRICS
      prisma.ticket.count({
        where: { ...whereTicketProperty, status: { notIn: ["RESOLVED", "CLOSED"] } }
      }),
      prisma.ticket.count({
        where: { ...whereTicketProperty, status: { in: ["RESOLVED", "CLOSED"] } }
      }),
      prisma.ticket.count({
        where: { 
          ...whereTicketProperty, 
          status: { notIn: ["RESOLVED", "CLOSED"] },
          slaDeadline: { lt: now } 
        }
      }),
      prisma.ticket.findMany({
        where: { ...whereTicketProperty, category: "MAINTENANCE", resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true }
      }),
      prisma.housekeepingTask.findMany({
        where: {
          ...whereProperty,
          status: "COMPLETED",
          startedAt: { not: null },
          completedAt: { not: null }
        },
        select: { startedAt: true, completedAt: true }
      }),
      // 3. GUEST METRICS
      prisma.guest.findMany({
        select: { _count: { select: { reservations: true } } }
      }),
      prisma.membership.count(),
      prisma.whatsAppMessage.count()
    ]);

    // Revenue aggregations
    const totalRevenue = reservations.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalNights = reservations.reduce((sum, r) => {
      const nights = Math.ceil((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / (1000 * 60 * 60 * 24));
      return sum + (nights > 0 ? nights : 1);
    }, 0);
    const adr = totalNights > 0 ? totalRevenue / totalNights : 0;

    // Source Distribution
    const sources = reservations.reduce((acc: Record<string, number>, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {});
    const bookingSources = Object.entries(sources).map(([name, value]) => ({ name, value }));

    // Accurate Occupancy Formula: (Total Rooms Sold) / (Total Inventory * Days)
    const daysInPeriod = differenceInDays(endDate, startDate) + 1;
    const totalAvailableInventory = totalUnits * daysInPeriod;
    const occupancyRate = totalAvailableInventory > 0 ? (totalNights / totalAvailableInventory) * 100 : 0;

    // Maintenance Time
    const avgMaintenanceTime = maintenanceTickets.length > 0 
      ? maintenanceTickets.reduce((sum, t) => sum + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()), 0) / maintenanceTickets.length / (1000 * 60 * 60)
      : 0;

    // Cleaning Time
    const avgCleaningTime = completedHousekeeping.length > 0
      ? completedHousekeeping.reduce((sum, t) => sum + (new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()), 0) / completedHousekeeping.length / (1000 * 60)
      : 0;

    // Guest segmentation
    const newGuests = guestsWithCounts.filter(g => g._count.reservations === 1).length;
    const repeatGuests = guestsWithCounts.filter(g => g._count.reservations > 1).length;

    return NextResponse.json({
      revenue: {
        total: totalRevenue,
        adr,
        occupancyRate: Math.min(100, occupancyRate), // Cap at 100% just in case of overbooking
        bookingSources
      },
      operations: {
        openTickets: openTicketsCount,
        completedTickets: completedTicketsCount,
        overdueTickets: overdueTicketsCount,
        avgCleaningTime, // in minutes
        avgMaintenanceTime // in hours
      },
      guests: {
        newGuests,
        repeatGuests,
        members,
        whatsappEngagement
      }
    });
  } catch (error: any) {
    console.error("[Analytics API Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
