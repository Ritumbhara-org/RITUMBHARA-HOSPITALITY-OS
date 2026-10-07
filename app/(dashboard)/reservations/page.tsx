import { prisma } from "@/lib/prisma"
import { ReservationsClient } from "@/components/reservations/reservations-client"

export const revalidate = 15

export default async function ReservationsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1
  const limit = 20
  const skip = (page - 1) * limit

  // Run all independent queries simultaneously
  const [reservations, totalCount, guests, units, allStats] = await Promise.all([
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
    prisma.reservation.findMany({
      select: { status: true, checkIn: true }
    })
  ])

  // Calculate summary stats across ALL reservations (not just the current page)
  const activeCount = allStats.filter(r => r.status === 'CHECKED_IN').length
  const upcomingCount = allStats.filter(r => r.status === 'CONFIRMED' && r.checkIn >= today).length
  const cancelledCount = allStats.filter(r => r.status === 'CANCELLED').length

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
