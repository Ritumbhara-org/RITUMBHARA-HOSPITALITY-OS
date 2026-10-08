import { prisma } from "@/lib/prisma"
import { ReservationsClient } from "@/components/reservations/reservations-client"

import { getSession } from "@/app/actions/auth"

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

  const session = await getSession();
  const isStaff = session?.user?.role === 'STAFF';
  const propertyFilter = isStaff && session?.user?.propertyId ? { propertyId: session.user.propertyId } : {};

  // Run all independent queries simultaneously
  const [reservations, totalCount, guests, units, allStats] = await Promise.all([
    prisma.reservation.findMany({
      where: propertyFilter,
      include: {
        guest: true,
        unit: true,
        property: true
      },
      orderBy: { checkIn: 'desc' },
      take: limit,
      skip: skip
    }),
    prisma.reservation.count({ where: propertyFilter }),
    prisma.guest.findMany({ 
      orderBy: { name: 'asc' }, 
      select: { id: true, name: true, phone: true } 
    }),
    prisma.unit.findMany({ 
      where: propertyFilter,
      orderBy: { name: 'asc' }, 
      select: { id: true, name: true, type: true } 
    }),
    prisma.reservation.findMany({
      where: propertyFilter,
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
    userRole={session?.user?.role}
  />
}
