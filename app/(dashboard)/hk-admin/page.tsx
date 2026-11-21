import { requireAdminPage } from "@/lib/auth/guard"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export const metadata = { title: "Housekeeping admin" }

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Needs redo",
  EXEMPT: "Exempt",
}

export default async function HkAdminHome() {
  await requireAdminPage("/hk-admin")
  const [locations, users, templates, recent] = await Promise.all([
    prisma.hkLocation.count({ where: { isActive: true } }),
    prisma.hkUser.count({ where: { isActive: true } }),
    prisma.hkChecklistTemplate.count({ where: { isActive: true } }),
    prisma.hkTurnover.findMany({
      orderBy: { checkInAt: "desc" },
      take: 20,
      include: {
        unit: { select: { name: true } },
        hkUser: { select: { name: true } },
        location: { select: { name: true } },
        _count: { select: { submissions: true } },
      },
    }),
  ])

  const stat = (label: string, value: number, href: string) => (
    <Link href={href} className="rounded-lg border p-4 hover:bg-muted/40">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Link>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Housekeeping overview</h1>
      <div className="grid grid-cols-3 gap-3">
        {stat("Active locations", locations, "/hk-admin/locations")}
        {stat("Active housekeepers", users, "/hk-admin/housekeepers")}
        {stat("Checklist templates", templates, "/hk-admin/checklists")}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Latest turnovers</h2>
        <div className="divide-y rounded-lg border">
          {recent.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing submitted yet.</p>}
          {recent.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-medium">
                  {t.unit.name} · {t.location.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.hkUser.name} · {t.checkInAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} · {t._count.submissions} item(s)
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{STATUS_LABEL[t.status] ?? t.status}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Review, approval, exemptions and the monthly tracker come in the next steps.</p>
      </section>
    </div>
  )
}
