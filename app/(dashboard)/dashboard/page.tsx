import { prisma } from "@/lib/prisma"
import { DashboardClient } from "@/components/dashboard/dashboard-client"
import { requireAdminPage } from "@/lib/auth/guard"
import { getTranslator } from "@/lib/i18n/server"

// Only the fields the dashboard and its detail panels show. Unit door/Wi-Fi codes and guest ID numbers stay on the server.
const guestFields = { select: { id: true, name: true, phone: true, email: true } } as const
const unitFields = { select: { id: true, name: true, type: true, floor: true } } as const
const propertyFields = { select: { name: true } } as const
const reservationInclude = { guest: guestFields, unit: unitFields, property: propertyFields } as const

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requireAdminPage("/dashboard")
  const tr = await getTranslator()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [
    activeStays,
    todayArrivals,
    pendingTickets,
    yesterdayArrivalsCount,
    todayDepartures,
    units,
    lowInventoryItems
  ] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: 'CHECKED_IN' },
      include: reservationInclude,
      orderBy: { checkOut: 'asc' }
    }),
    prisma.reservation.findMany({
      where: {
        checkIn: {
          gte: today,
          lt: tomorrow
        },
        status: 'CONFIRMED'
      },
      include: reservationInclude,
      orderBy: { checkIn: 'asc' }
    }),
    prisma.ticket.findMany({
      where: {
        status: { notIn: ['RESOLVED', 'CLOSED'] }
      },
      include: {
        unit: { select: { name: true } },
        property: propertyFields,
        assignedTo: { select: { name: true } }
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
      include: reservationInclude,
      orderBy: { checkOut: 'asc' }
    }),
    prisma.unit.findMany({
      select: { id: true, name: true, type: true, floor: true, capacity: true, status: true, property: propertyFields },
      orderBy: { name: 'asc' }
    }),
    prisma.inventoryItem.findMany({
      where: {
        quantity: { lt: prisma.inventoryItem.fields.minThreshold }
      },
      include: {
        property: propertyFields
      },
      take: 5
    })
  ])

  // Unit totals come from the one unit list above, which also feeds the unit detail panels.
  const countOf = (status: string) => units.filter((u) => u.status === status).length
  const unitStatusCounts = [...new Set(units.map((u) => u.status))].map((status) => ({ status, _count: { id: countOf(status) } }))
  const totalUnits = units.length
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
    activeGuests: activeStays.length.toString(),
    occupancyRate: `${occupancyRate}%`,
    arrivals: todayArrivals,
    pendingOperations: pendingTickets,
    departures: todayDepartures,
    unitStatuses: unitStatusCounts,
    units,
    activeStays,
    lowInventory: lowInventoryItems
  }

  return <DashboardClient data={dashboardData} />
}
