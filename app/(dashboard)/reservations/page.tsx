import { prisma } from "@/lib/prisma"
import { ReservationsClient } from "@/components/reservations/reservations-client"
import { requireAdminPage } from "@/lib/auth/guard"

export const revalidate = 15

export default async function ReservationsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireAdminPage("/reservations")
  const searchParams = await props.searchParams;
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1
  const limit = 20
  const skip = (page - 1) * limit

  // Run all independent queries simultaneously
  const [reservations, totalCount, guests, units, activeCount, upcomingCount, cancelledCount] = await Promise.all([
    prisma.reservation.findMany({
      include: {
        guest: true,
        unit: true,
        property: true
      },
      orderBy: { checkIn: 'desc' },
      take: limit,
      skip: skip
    }),
    prisma.reservation.count(),
    prisma.guest.findMany({ 
      orderBy: { name: 'asc' }, 
      select: { id: true, name: true, phone: true } 
    }),
    prisma.unit.findMany({ 
      orderBy: { name: 'asc' }, 
      select: { id: true, name: true, type: true } 
    }),
    // Summary stats across ALL reservations, counted by the database (not by loading every row).
    prisma.reservation.count({ where: { status: 'CHECKED_IN' } }),
    prisma.reservation.count({ where: { status: 'CONFIRMED', checkIn: { gte: today } } }),
    prisma.reservation.count({ where: { status: 'CANCELLED' } }),
  ])

  const stats = {
    total: totalCount,
    active: activeCount,
    upcoming: upcomingCount,
    cancelled: cancelledCount
  }

  const totalPages = Math.ceil(totalCount / limit)

  return <ReservationsClient 
    initialData={reservations} 
    stats={stats} 
    guests={guests} 
    units={units} 
    currentPage={page}
    totalPages={totalPages}
  />
}
