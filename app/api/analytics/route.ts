import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, startOfDay } from "date-fns";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get("propertyId");
    
    // Timeframes
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const whereProperty = propertyId ? { propertyId } : {};
    const whereUnitProperty = propertyId ? { propertyId } : {};
    const whereTicketProperty = propertyId ? { propertyId } : {};

    // 1. REVENUE METRICS (Current Month)
    const reservations = await prisma.reservation.findMany({
      where: {
        ...whereProperty,
        checkIn: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELLED" }
      }
    });

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

    // Occupancy
    const totalUnits = await prisma.unit.count({ where: whereUnitProperty });
    const currentlyOccupied = await prisma.unit.count({
      where: { ...whereUnitProperty, status: "OCCUPIED" }
    });
    const occupancyRate = totalUnits > 0 ? (currentlyOccupied / totalUnits) * 100 : 0;

    // 2. OPERATIONS METRICS
    const tickets = await prisma.ticket.findMany({
      where: { ...whereTicketProperty }
    });
    
    const openTickets = tickets.filter(t => t.status !== "RESOLVED" && t.status !== "CLOSED").length;
    const completedTickets = tickets.filter(t => t.status === "RESOLVED" || t.status === "CLOSED").length;
    const overdueTickets = tickets.filter(t => 
      (t.status !== "RESOLVED" && t.status !== "CLOSED") && 
      (new Date(t.slaDeadline).getTime() < now.getTime())
    ).length;

    // Average Maintenance Resolution Time (hours)
    const resolvedMaintenance = tickets.filter(t => 
      t.category === "MAINTENANCE" && t.resolvedAt
    );
    const avgMaintenanceTime = resolvedMaintenance.length > 0 
      ? resolvedMaintenance.reduce((sum, t) => sum + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()), 0) / resolvedMaintenance.length / (1000 * 60 * 60)
      : 0;

    // Average Cleaning Time (minutes)
    const completedHousekeeping = await prisma.housekeepingTask.findMany({
      where: {
        ...whereProperty,
        status: "COMPLETED",
        startedAt: { not: null },
        completedAt: { not: null }
      }
    });
    const avgCleaningTime = completedHousekeeping.length > 0
      ? completedHousekeeping.reduce((sum, t) => sum + (new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()), 0) / completedHousekeeping.length / (1000 * 60)
      : 0;

    // 3. GUEST METRICS
    const allGuests = await prisma.guest.findMany({
      include: {
        _count: {
          select: { reservations: true }
        }
      }
    });

    const newGuests = allGuests.filter(g => g._count.reservations === 1).length;
    const repeatGuests = allGuests.filter(g => g._count.reservations > 1).length;
    
    const members = await prisma.membership.count();

    // WhatsApp Engagement (Total inbound/outbound messages)
    const whatsappEngagement = await prisma.whatsAppMessage.count();

    return NextResponse.json({
      revenue: {
        total: totalRevenue,
        adr,
        occupancyRate,
        bookingSources
      },
      operations: {
        openTickets,
        completedTickets,
        overdueTickets,
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
