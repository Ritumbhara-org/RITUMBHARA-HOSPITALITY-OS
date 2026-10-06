import { prisma } from "@/lib/prisma"
import { UnitsClient } from "@/components/units/units-client"

import { getSession } from "@/app/actions/auth"

export const revalidate = 15

export default async function UnitsPage() {
  const session = await getSession();
  const isStaff = session?.user?.role === 'STAFF';
  const propertyFilter = isStaff && session?.user?.propertyId ? { propertyId: session.user.propertyId } : {};

  const units = await prisma.unit.findMany({
    where: propertyFilter,
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

  const properties = await prisma.property.findMany({
    where: isStaff && session?.user?.propertyId ? { id: session.user.propertyId } : {},
    orderBy: { name: 'asc' }
  })

  return <UnitsClient initialData={units} stats={stats} properties={properties} userRole={session?.user?.role} userPropertyId={session?.user?.propertyId} />
}
