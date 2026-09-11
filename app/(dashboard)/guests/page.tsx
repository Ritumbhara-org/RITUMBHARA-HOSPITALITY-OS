import { prisma } from "@/lib/prisma"
import { GuestsClient } from "@/components/guests/guests-client"

export const dynamic = 'force-dynamic'

export default async function GuestsPage() {
  const guests = await prisma.guest.findMany({
    include: {
      membership: true,
      reservations: {
        select: {
          id: true,
          status: true,
          totalAmount: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  // Calculate summary stats
  const totalGuests = guests.length
  const membersCount = guests.filter(g => g.membership).length
  
  // Calculate VIPs (let's say Platinum or Diamond tier, or highest spenders)
  const vipCount = guests.filter(g => 
    g.membership?.tier === 'PLATINUM' || 
    g.membership?.tier === 'DIAMOND'
  ).length

  // Calculate active stays right now
  const activeStays = guests.filter(g => 
    g.reservations.some(r => r.status === 'CHECKED_IN')
  ).length

  const stats = {
    total: totalGuests,
    members: membersCount,
    vips: vipCount,
    activeStays: activeStays
  }

  return <GuestsClient initialData={guests} stats={stats} />
}
