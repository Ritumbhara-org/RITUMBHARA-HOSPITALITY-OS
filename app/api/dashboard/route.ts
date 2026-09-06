import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard — aggregated stats for management dashboard
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get("propertyId")

    const where = propertyId ? { propertyId } : {}

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [
      arrivals,
      departures,
      unitStatusCounts,
      pendingTickets,
      openTicketCount,
      inProgressTicketCount,
    ] = await Promise.all([
      // Today's arrivals
      prisma.reservation.findMany({
        where: {
          ...where,
          checkIn: { gte: today, lt: tomorrow },
          status: { in: ["CONFIRMED", "ARRIVING"] },
        },
        include: {
          guest: { select: { name: true } },
          unit: { select: { name: true, type: true } },
        },
        orderBy: { checkIn: "asc" },
      }),
      // Today's departures
      prisma.reservation.findMany({
        where: {
          ...where,
          checkOut: { gte: today, lt: tomorrow },
          status: "CHECKED_IN",
        },
        include: {
          guest: { select: { name: true } },
          unit: { select: { name: true, type: true } },
        },
        orderBy: { checkOut: "asc" },
      }),
      // Unit status breakdown
      prisma.unit.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
      // Pending/open tickets
      prisma.ticket.findMany({
        where: { ...where, status: { in: ["OPEN", "TRIAGED", "ASSIGNED"] } },
        include: {
          unit: { select: { name: true } },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 10,
      }),
      prisma.ticket.count({ where: { ...where, status: { in: ["OPEN", "TRIAGED"] } } }),
      prisma.ticket.count({ where: { ...where, status: { in: ["IN_PROGRESS", "ACKNOWLEDGED"] } } }),
    ])

    const unitStatus = unitStatusCounts.reduce((acc: any, cur: any) => {
      acc[cur.status] = cur._count.status
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      data: {
        arrivals,
        departures,
        unitStatus,
        pendingTickets,
        stats: {
          openTickets: openTicketCount,
          inProgressTickets: inProgressTicketCount,
          arrivalsToday: arrivals.length,
          departuresToday: departures.length,
        }
      }
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
