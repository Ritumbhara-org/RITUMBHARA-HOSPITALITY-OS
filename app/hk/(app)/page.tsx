import { prisma } from "@/lib/prisma"
import { requireHk } from "@/lib/hk/session"
import { startOfDayIST } from "@/lib/hk/time"
import { StartTurnoverButton } from "@/components/hk/start-turnover-button"
import Link from "next/link"

export const metadata = { title: "Housekeeping" }

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Needs redo",
  EXEMPT: "Exempt",
}

export default async function HkHomePage() {
  const hk = await requireHk()

  const assignments = await prisma.hkAssignment.findMany({
    where: { hkUserId: hk.id, location: { isActive: true } },
    include: { location: true },
    orderBy: { location: { name: "asc" } },
  })
  const propertyIds = assignments.map((a) => a.location.propertyId)

  const [units, turnovers] = await Promise.all([
    prisma.unit.findMany({
      where: { propertyId: { in: propertyIds } },
      orderBy: [{ floor: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true, propertyId: true },
    }),
    prisma.hkTurnover.findMany({
      where: { hkUserId: hk.id, checkInAt: { gte: startOfDayIST() } },
      orderBy: { checkInAt: "desc" },
      select: { id: true, unitId: true, status: true },
    }),
  ])

  if (assignments.length === 0) {
    return <p className="text-sm text-muted-foreground">No locations are assigned to you yet. Ask your manager.</p>
  }

  return (
    <div className="space-y-6">
      {assignments.map(({ location }) => {
        const locUnits = units.filter((u) => u.propertyId === location.propertyId)
        return (
          <section key={location.id} className="space-y-2">
            <h1 className="text-lg font-bold">{location.name}</h1>
            <div className="divide-y rounded-lg border">
              {locUnits.length === 0 && <p className="p-3 text-sm text-muted-foreground">No units at this location.</p>}
              {locUnits.map((u) => {
                const mine = turnovers.filter((t) => t.unitId === u.id)
                const open = mine.find((t) => t.status === "IN_PROGRESS")
                const latest = mine[0]
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.type}
                        {latest ? ` · Today: ${STATUS_LABEL[latest.status] ?? latest.status}` : ""}
                      </p>
                    </div>
                    {open ? (
                      <Link href={`/hk/turnover/${open.id}`} className="text-sm underline">
                        Continue
                      </Link>
                    ) : (
                      <StartTurnoverButton locationId={location.id} unitId={u.id} resume={false} />
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
