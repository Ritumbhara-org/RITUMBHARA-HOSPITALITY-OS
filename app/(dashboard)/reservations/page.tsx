import { prisma } from "@/lib/prisma"
import { ReservationsClient } from "@/components/reservations/reservations-client"

export const dynamic = 'force-dynamic'

export default async function ReservationsPage() {
  const reservations = await prisma.reservation.findMany({
    include: {
      guest: true,
      unit: true,
      property: true
    },
    orderBy: {
      checkIn: 'desc'
    }
  })

  // Calculate summary stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const activeCount = reservations.filter(r => r.status === 'CHECKED_IN').length
  const upcomingCount = reservations.filter(r => r.status === 'CONFIRMED' && r.checkIn >= today).length
  const cancelledCount = reservations.filter(r => r.status === 'CANCELLED').length

  const stats = {
    total: reservations.length,
    active: activeCount,
    upcoming: upcomingCount,
    cancelled: cancelledCount
  }

  // Fetch guests and units for the New Booking form
  const [guests, units] = await Promise.all([
    prisma.guest.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
    prisma.unit.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, type: true } })
  ])

  return <ReservationsClient initialData={reservations} stats={stats} guests={guests} units={units} />
}
