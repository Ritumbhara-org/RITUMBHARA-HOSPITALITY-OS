import { prisma } from "@/lib/prisma"
import { DashboardClient } from "@/components/dashboard/dashboard-client"

import { getSession } from "@/app/actions/auth"

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSession();
  const isStaff = session?.user?.role === 'STAFF';
  const propertyFilter = isStaff && session?.user?.propertyId ? { propertyId: session.user.propertyId } : {};

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
    pendingTickets,
    yesterdayArrivalsCount,
    todayDepartures,
    unitStatusCounts,
    lowInventoryItems
  ] = await Promise.all([
    prisma.unit.count({ where: propertyFilter }),
    prisma.unit.count({ where: { status: 'AVAILABLE', ...propertyFilter } }),
    prisma.unit.count({ where: { status: 'DIRTY', ...propertyFilter } }),
    prisma.reservation.count({ where: { status: 'CHECKED_IN', ...propertyFilter } }),
    prisma.reservation.findMany({
      where: {
        checkIn: {
          gte: today,
          lt: tomorrow
        },
        status: 'CONFIRMED',
        ...propertyFilter
      },
      include: {
        guest: true,
        unit: true
      },
      orderBy: { checkIn: 'asc' }
    }),
    prisma.ticket.findMany({
      where: {
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        ...propertyFilter
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
        status: { not: 'CANCELLED' },
        ...propertyFilter
      }
    }),
    prisma.reservation.findMany({
      where: {
        checkOut: {
          gte: today,
          lt: tomorrow
        },
        status: 'CHECKED_IN',
        ...propertyFilter
      },
      include: {
        guest: true,
        unit: true
      },
      orderBy: { checkOut: 'asc' }
    }),
    prisma.unit.groupBy({
      by: ['status'],
      where: propertyFilter,
      _count: {
        id: true
      }
    }),
    prisma.inventoryItem.findMany({
      where: {
        quantity: { lt: prisma.inventoryItem.fields.minThreshold },
        ...propertyFilter
      },
      include: {
        property: true
      },
      take: 5
    })
  ])

  // Calculate stats
  const occupancyRate = totalUnits > 0 
    ? Math.round(((totalUnits - availableUnitsCount) / totalUnits) * 100) 
    : 0

  const arrivalsTrend = todayArrivals.length >= yesterdayArrivalsCount
    ? `+${todayArrivals.length - yesterdayArrivalsCount} from yesterday`
    : `${todayArrivals.length - yesterdayArrivalsCount} from yesterday`

  const dashboardData = {
    todayArrivals: todayArrivals.length.toString(),
    arrivalsTrend,
    availableUnits: availableUnitsCount.toString(),
    unitsTrend: `${dirtyUnitsCount} dirty, ${totalUnits - availableUnitsCount - dirtyUnitsCount} occupied`,
    activeGuests: activeGuestsCount.toString(),
    occupancyRate: `${occupancyRate}%`,
    arrivals: todayArrivals,
    pendingOperations: pendingTickets,
    departures: todayDepartures,
    unitStatuses: unitStatusCounts,
    lowInventory: lowInventoryItems
  }

  return <DashboardClient data={dashboardData} user={session?.user} />
}
