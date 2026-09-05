import { prisma } from "@/lib/prisma"
import { ReservationsClient } from "@/components/reservations/reservations-client"

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

  return <ReservationsClient initialData={reservations} stats={stats} />
}
