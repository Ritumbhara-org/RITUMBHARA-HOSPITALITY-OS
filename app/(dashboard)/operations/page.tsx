import { prisma } from "@/lib/prisma"
import { OperationsClient } from "@/components/operations/operations-client"

export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  const tickets = await prisma.ticket.findMany({
    include: {
      property: true,
      unit: true,
      guest: true,
      assignedTo: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  // Fetch all units so they can be selected when creating a ticket
  const units = await prisma.unit.findMany({
    orderBy: {
      name: 'asc'
    },
    select: {
      id: true,
      name: true
    }
  })

  // Calculate stats
  const total = tickets.length
  const open = tickets.filter(t => t.status === 'OPEN' || t.status === 'TRIAGED').length
  const inProgress = tickets.filter(t => t.status === 'ASSIGNED' || t.status === 'ACKNOWLEDGED' || t.status === 'IN_PROGRESS').length
  const resolved = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'VERIFIED' || t.status === 'CLOSED').length

  const stats = {
    total,
    open,
    inProgress,
    resolved
  }

  return <OperationsClient initialData={tickets} stats={stats} units={units} />
}
