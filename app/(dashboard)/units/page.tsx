import { prisma } from "@/lib/prisma"
import { UnitsClient } from "@/components/units/units-client"

export default async function UnitsPage() {
  const units = await prisma.unit.findMany({
    include: {
      property: true,
      reservations: {
        where: {
          status: 'CHECKED_IN'
        },
        include: {
          guest: true
        }
      },
      housekeepingTasks: {
        where: {
          status: { notIn: ['COMPLETED'] }
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  })

  // Group by status for stats
  const total = units.length
  const available = units.filter(u => u.status === 'AVAILABLE' || u.status === 'READY').length
  const occupied = units.filter(u => u.status === 'OCCUPIED').length
  const dirty = units.filter(u => u.status === 'DIRTY').length
  const maintenance = units.filter(u => u.status === 'MAINTENANCE').length

  const stats = {
    total,
    available,
    occupied,
    dirty,
    maintenance
  }

  return <UnitsClient initialData={units} stats={stats} />
}
