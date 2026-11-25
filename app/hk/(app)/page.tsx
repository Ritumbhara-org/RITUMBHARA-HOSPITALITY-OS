import { prisma } from "@/lib/prisma"
import { requireHk } from "@/lib/hk/session"
import { startOfDayIST } from "@/lib/hk/time"
import { ExemptionButton } from "@/components/hk/exemption-button"
import { StartTurnoverButton } from "@/components/hk/start-turnover-button"
import { LocationCheck } from "@/components/hk/location-check"
import Link from "next/link"

export const metadata = { title: "हाउसकीपिंग" }

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "जारी है",
  SUBMITTED: "जमा हो गया",
  APPROVED: "मंज़ूर",
  REJECTED: "दोबारा करें",
  EXEMPT: "छूट मिली",
}

export default async function HkHomePage() {
  const hk = await requireHk()

  const assignments = await prisma.hkAssignment.findMany({
    where: { hkUserId: hk.id, location: { isActive: true } },
    include: { location: true },
    orderBy: { location: { name: "asc" } },
  })
  const propertyIds = assignments.map((a) => a.location.propertyId)

  const [units, turnovers, exemptions] = await Promise.all([
    prisma.unit.findMany({
      where: { propertyId: { in: propertyIds } },
      orderBy: [{ floor: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true, propertyId: true },
    }),
    prisma.hkTurnover.findMany({
      where: { hkUserId: hk.id, checkInAt: { gte: startOfDayIST() } },
      orderBy: { checkInAt: "desc" },
      select: { id: true, unitId: true, status: true, reviewNote: true },
    }),
    prisma.hkExemption.findMany({
      where: { hkUserId: hk.id, day: startOfDayIST() },
      orderBy: { createdAt: "desc" },
      select: { unitId: true, status: true, decisionNote: true },
    }),
  ])

  if (assignments.length === 0) {
    return <p className="text-sm text-muted-foreground">अभी आपको कोई लोकेशन नहीं दी गई है। अपने मैनेजर से पूछें।</p>
  }

  return (
    <div className="space-y-6">
      <LocationCheck />
      {assignments.map(({ location }) => {
        const locUnits = units.filter((u) => u.propertyId === location.propertyId)
        return (
          <section key={location.id} className="space-y-2">
            <h1 className="text-lg font-bold">{location.name}</h1>
            <div className="divide-y rounded-lg border">
              {locUnits.length === 0 && <p className="p-3 text-sm text-muted-foreground">इस लोकेशन पर कोई यूनिट नहीं है।</p>}
              {locUnits.map((u) => {
                const mine = turnovers.filter((t) => t.unitId === u.id)
                const open = mine.find((t) => t.status === "IN_PROGRESS")
                const latest = mine[0]
                const ex = exemptions.find((x) => x.unitId === u.id)
                const exempt = ex?.status === "APPROVED"
                return (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.type}
                        {latest ? ` · आज: ${STATUS_LABEL[latest.status] ?? latest.status}` : ""}
                        {ex ? ` · गेस्ट मौजूद: ${ex.status === "PENDING" ? "मैनेजर के जवाब का इंतज़ार" : ex.status === "APPROVED" ? "मंज़ूर" : "मंज़ूर नहीं"}` : ""}
                      </p>
                      {latest?.status === "REJECTED" && latest.reviewNote && <p className="text-xs text-red-600">मैनेजर: {latest.reviewNote}</p>}
                      {ex?.status === "REJECTED" && ex.decisionNote && <p className="text-xs text-red-600">मैनेजर: {ex.decisionNote}</p>}
                    </div>
                    {exempt ? (
                      <span className="text-xs text-muted-foreground">आज छूट मिली</span>
                    ) : open ? (
                      <Link href={`/hk/turnover/${open.id}`} className="text-sm underline">
                        जारी रखें
                      </Link>
                    ) : (
                      <div className="flex gap-2">
                        <StartTurnoverButton locationId={location.id} unitId={u.id} resume={false} />
                        {(!ex || ex.status === "REJECTED") && <ExemptionButton locationId={location.id} unitId={u.id} />}
                      </div>
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
