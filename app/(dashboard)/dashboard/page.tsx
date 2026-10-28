import { prisma } from "@/lib/prisma"
import { DashboardClient } from "@/components/dashboard/dashboard-client"
import { requireAdminPage } from "@/lib/auth/guard"
import { getTranslator } from "@/lib/i18n/server"

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requireAdminPage("/dashboard")
  const tr = await getTranslator()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [
    activeGuestsCount,
    todayArrivals,
    pendingTickets,
    yesterdayArrivalsCount,
    todayDepartures,
    unitStatusCounts,
    lowInventoryItems
  ] = await Promise.all([
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
    }),
    prisma.inventoryItem.findMany({
      where: {
        quantity: { lt: prisma.inventoryItem.fields.minThreshold }
      },
      include: {
        property: true
      },
      take: 5
    })
  ])

  // Unit totals come from the one status grouping above (3 fewer database round trips).
  const countOf = (status: string) => unitStatusCounts.find((u) => u.status === status)?._count.id ?? 0
  const totalUnits = unitStatusCounts.reduce((sum, u) => sum + u._count.id, 0)
  const availableUnitsCount = countOf('AVAILABLE')
  const dirtyUnitsCount = countOf('DIRTY')

  // Calculate stats
  const occupancyRate = totalUnits > 0 
    ? Math.round(((totalUnits - availableUnitsCount) / totalUnits) * 100) 
    : 0

  const arrivalsTrend = todayArrivals.length >= yesterdayArrivalsCount
    ? tr("{n} from yesterday", { n: `+${todayArrivals.length - yesterdayArrivalsCount}` })
    : tr("{n} from yesterday", { n: todayArrivals.length - yesterdayArrivalsCount })

  const dashboardData = {
    todayArrivals: todayArrivals.length.toString(),
    arrivalsTrend,
    availableUnits: availableUnitsCount.toString(),
    unitsTrend: tr("{dirty} dirty, {occupied} occupied", { dirty: dirtyUnitsCount, occupied: totalUnits - availableUnitsCount - dirtyUnitsCount }),
    activeGuests: activeGuestsCount.toString(),
    occupancyRate: `${occupancyRate}%`,
    arrivals: todayArrivals,
    pendingOperations: pendingTickets,
    departures: todayDepartures,
    unitStatuses: unitStatusCounts,
    lowInventory: lowInventoryItems
  }

  return <DashboardClient data={dashboardData} />
}
