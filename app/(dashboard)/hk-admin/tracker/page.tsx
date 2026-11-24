import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/guard"
import { ActionForm } from "@/components/hk/action-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { computeBonus, isValidMonth, monthOfIST, monthRangeIST, type TurnoverStatus } from "@/lib/hk/bonus"
import { addHkStayRating, clearHkBonusDecision, deleteHkStayRating, setHkBonusDecision } from "@/app/actions/hk-admin"

export const metadata = { title: "Housekeeping tracker" }

const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: "In progress", SUBMITTED: "Waiting review", APPROVED: "Approved", REJECTED: "Rejected", EXEMPT: "Exempt" }
const FINAL_LABEL = { AWARDED: "Bonus: earned", NOT_AWARDED: "Bonus: failed", PENDING: "Bonus: pending" } as const
const DAY_MS = 86_400_000

function shiftMonth(m: string, by: number) {
  const [y, mm] = m.split("-").map(Number)
  const d = new Date(Date.UTC(y, mm - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdminPage("/hk-admin/tracker")
  const sp = await searchParams
  const month = sp.month && isValidMonth(sp.month) ? sp.month : monthOfIST(new Date())
  const { start, end } = monthRangeIST(month)

  const users = await prisma.hkUser.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { assignments: { include: { location: { select: { propertyId: true } } } } },
  })
  const userIds = users.map((u) => u.id)

  const [turnovers, exemptions, ratings, decisions, units, reservations] = await Promise.all([
    prisma.hkTurnover.findMany({ where: { hkUserId: { in: userIds }, checkInAt: { gte: start, lt: end } }, orderBy: { checkInAt: "asc" }, include: { unit: { select: { name: true } } } }),
    prisma.hkExemption.findMany({ where: { hkUserId: { in: userIds }, status: "APPROVED", day: { gte: start, lt: end } } }),
    prisma.hkStayRating.findMany({ where: { hkUserId: { in: userIds }, month }, orderBy: { createdAt: "asc" }, include: { unit: { select: { name: true } } } }),
    prisma.hkBonusDecision.findMany({ where: { hkUserId: { in: userIds }, month } }),
    prisma.unit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, propertyId: true } }),
    prisma.reservation.findMany({
      where: { checkOut: { gte: start, lt: end }, NOT: { status: { in: ["cancelled", "Cancelled", "CANCELLED", "canceled"] } } },
      select: { unitId: true, propertyId: true, checkOut: true },
    }),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Tracker · {month}</h1>
        <div className="flex gap-2 text-sm">
          <Link href={`/hk-admin/tracker?month=${shiftMonth(month, -1)}`} className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Previous</Link>
          <Link href={`/hk-admin/tracker?month=${shiftMonth(month, 1)}`} className="rounded-md border px-3 py-1.5 hover:bg-muted/40">Next</Link>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Bonus is all or nothing: one rejected turnover, or any review below 5 stars, fails the month. Stays with no review do not count against the housekeeper. Settle about 15 days after month end.
      </p>

      {users.length === 0 && <p className="text-sm text-muted-foreground">No active housekeepers.</p>}
      {users.map((u) => {
        const myT = turnovers.filter((t) => t.hkUserId === u.id)
        const myEx = exemptions.filter((x) => x.hkUserId === u.id)
        const myR = ratings.filter((r) => r.hkUserId === u.id)
        const decision = decisions.find((d) => d.hkUserId === u.id)
        const result = computeBonus({
          turnoverStatuses: myT.map((t) => t.status as TurnoverStatus),
          approvedExemptions: myEx.length,
          ratings: myR.map((r) => r.rating),
          override: decision ? { awarded: decision.awarded, reason: decision.reason } : null,
        })

        // Checkouts at their properties with no turnover or approved exemption within 2 days: a warning only.
        const propertyIds = new Set(u.assignments.map((a) => a.location.propertyId))
        const uncovered = reservations.filter((r) => {
          if (!propertyIds.has(r.propertyId)) return false
          const from = r.checkOut.getTime() - DAY_MS / 2
          const to = r.checkOut.getTime() + 2 * DAY_MS
          const done = turnovers.some((t) => t.unitId === r.unitId && t.status !== "REJECTED" && t.checkInAt.getTime() >= from && t.checkInAt.getTime() <= to)
          const exempt = exemptions.some((x) => x.unitId === r.unitId && x.day.getTime() >= from - DAY_MS && x.day.getTime() <= to)
          return !done && !exempt
        }).length
        const myUnits = units.filter((x) => propertyIds.has(x.propertyId))
        const tone = result.final === "AWARDED" ? "text-green-700" : result.final === "NOT_AWARDED" ? "text-red-700" : "text-amber-700"

        return (
          <section key={u.id} className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {result.counts.approved} approved · {result.counts.waiting} waiting · {result.counts.rejected} rejected · {result.counts.exempt} exempt · {myT.length} turnovers
                </p>
              </div>
              <p className={`text-sm font-semibold ${tone}`}>{FINAL_LABEL[result.final]}{result.overridden ? " (admin decision)" : ""}</p>
            </div>
            {result.reasons.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            {uncovered > 0 && <p className="text-sm text-amber-700">{uncovered} checkout(s) this month have no turnover or exemption logged. Check before settling.</p>}

            <details>
              <summary className="cursor-pointer text-sm font-medium">Turnovers ({myT.length})</summary>
              <div className="mt-2 divide-y rounded border text-sm">
                {myT.length === 0 && <p className="p-2 text-muted-foreground">None this month.</p>}
                {myT.map((t) => (
                  <div key={t.id} className="flex flex-wrap justify-between gap-2 p-2">
                    <span>{t.checkInAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })} · {t.unit.name}</span>
                    <span className="text-xs">{STATUS_LABEL[t.status]}{t.reviewNote ? ` · ${t.reviewNote}` : ""}</span>
                  </div>
                ))}
              </div>
            </details>

            <div className="space-y-2">
              <p className="text-sm font-medium">Guest reviews counted this month</p>
              {myR.length === 0 && <p className="text-xs text-muted-foreground">No reviews entered.</p>}
              {myR.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{r.unit.name} · {r.rating} star{r.rating === 1 ? "" : "s"}{r.note ? ` · ${r.note}` : ""}</span>
                  <ActionForm action={deleteHkStayRating.bind(null, r.id)} submitLabel="Remove" variant="outline" resetOnSuccess={false} />
                </div>
              ))}
              <ActionForm action={addHkStayRating} submitLabel="Add review" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="hkUserId" value={u.id} />
                <input type="hidden" name="month" value={month} />
                <div className="space-y-1">
                  <Label htmlFor={`unit-${u.id}`}>Unit</Label>
                  <select id={`unit-${u.id}`} name="unitId" required className="h-9 rounded-md border bg-background px-2 text-sm">
                    {myUnits.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rating-${u.id}`}>Stars</Label>
                  <Input id={`rating-${u.id}`} name="rating" type="number" min={1} max={5} required className="w-20" />
                </div>
                <Input name="note" placeholder="Note (optional)" className="w-48" />
              </ActionForm>
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Override (genuine accident, etc.)</p>
              {decision && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{decision.awarded ? "Awarded" : "Not awarded"}: {decision.reason}</span>
                  <ActionForm action={clearHkBonusDecision.bind(null, u.id, month)} submitLabel="Remove override" variant="outline" resetOnSuccess={false} />
                </div>
              )}
              <ActionForm action={setHkBonusDecision.bind(null, u.id, month)} submitLabel="Save override" variant="outline" className="flex flex-wrap items-end gap-2" resetOnSuccess={false}>
                <select name="awarded" defaultValue="yes" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="yes">Award bonus</option>
                  <option value="no">Do not award</option>
                </select>
                <Input name="reason" placeholder="Reason (required, logged)" className="w-72" required />
              </ActionForm>
            </div>
          </section>
        )
      })}
    </div>
  )
}
