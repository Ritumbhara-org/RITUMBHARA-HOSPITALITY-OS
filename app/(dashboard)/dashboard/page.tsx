import { prisma } from "@/lib/prisma"
import { DashboardClient } from "@/components/dashboard/dashboard-client"

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [
    totalUnits,
    availableUnitsCount,
    dirtyUnitsCount,
    activeGuestsCount,
    todayArrivals,
    totalTodayCheckinsCount,
    pendingTickets,
    yesterdayArrivalsCount,
    todayDepartures,
    unitStatusCounts
  ] = await Promise.all([
    prisma.unit.count(),
    prisma.unit.count({ where: { status: 'AVAILABLE' } }),
    prisma.unit.count({ where: { status: 'DIRTY' } }),
    prisma.reservation.count({ where: { status: 'CHECKED_IN' } }),
    prisma.reservation.findMany({
      where: {
        checkIn: {
          gte: today,
          lt: tomorrow
        },
        status: 'CONFIRMED'
      },
      include: {
        guest: true,
        unit: true
      },
      orderBy: { checkIn: 'asc' }
    }),
    prisma.reservation.count({
      where: {
        checkIn: {
          gte: today,
          lt: tomorrow
        },
        status: { in: ['CONFIRMED', 'CHECKED_IN'] }
      }
    }),
    prisma.ticket.findMany({
      where: {
        status: { notIn: ['RESOLVED', 'CLOSED'] }
      },
      include: {
        unit: true
      },
      orderBy: { priority: 'asc' }, // Will sort enum correctly depending on definition, fallback to createdAt if needed
      take: 5
    }),
    prisma.reservation.count({
      where: {
        checkIn: {
          gte: new Date(today.getTime() - 24 * 60 * 60 * 1000),
          lt: today
        },
        status: { not: 'CANCELLED' }
      }
    }),
    prisma.reservation.findMany({
      where: {
        checkOut: {
          gte: today,
          lt: tomorrow
        },
        status: 'CHECKED_IN'
      },
      include: {
        guest: true,
        unit: true
      },
      orderBy: { checkOut: 'asc' }
    }),
    prisma.unit.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    })
  ])

  // Calculate stats
  const occupancyRate = totalUnits > 0 
    ? Math.round(((totalUnits - availableUnitsCount) / totalUnits) * 100) 
    : 0

  const arrivalsTrend = totalTodayCheckinsCount >= yesterdayArrivalsCount
    ? `+${totalTodayCheckinsCount - yesterdayArrivalsCount} from yesterday`
    : `${totalTodayCheckinsCount - yesterdayArrivalsCount} from yesterday`

  const dashboardData = {
    todayArrivals: totalTodayCheckinsCount.toString(),
    arrivalsTrend,
    availableUnits: availableUnitsCount.toString(),
    unitsTrend: `${dirtyUnitsCount} dirty, ${totalUnits - availableUnitsCount - dirtyUnitsCount} occupied`,
    activeGuests: activeGuestsCount.toString(),
    occupancyRate: `${occupancyRate}%`,
    arrivals: todayArrivals,
    pendingOperations: pendingTickets,
    departures: todayDepartures,
    unitStatuses: unitStatusCounts
  }

  return <DashboardClient data={dashboardData} />
}
