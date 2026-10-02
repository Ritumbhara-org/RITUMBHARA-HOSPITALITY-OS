import { prisma } from "@/lib/prisma"
import { ReservationsClient } from "@/components/reservations/reservations-client"

export const dynamic = 'force-dynamic'

export default async function ReservationsPage() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Run all independent queries simultaneously
  const [reservations, guests, units] = await Promise.all([
    prisma.reservation.findMany({
      include: {
        guest: true,
        unit: true,
        property: true
      },
      orderBy: { checkIn: 'desc' }
    }),
    prisma.guest.findMany({ 
      orderBy: { name: 'asc' }, 
      select: { id: true, name: true, phone: true } 
    }),
    prisma.unit.findMany({ 
      orderBy: { name: 'asc' }, 
      select: { id: true, name: true, type: true } 
    })
  ])

  // Calculate summary stats
  const activeCount = reservations.filter(r => r.status === 'CHECKED_IN').length
  const upcomingCount = reservations.filter(r => r.status === 'CONFIRMED' && r.checkIn >= today).length
  const cancelledCount = reservations.filter(r => r.status === 'CANCELLED').length

  const stats = {
    total: reservations.length,
    active: activeCount,
    upcoming: upcomingCount,
    cancelled: cancelledCount
  }

  return <ReservationsClient initialData={reservations} stats={stats} guests={guests} units={units} />
}
