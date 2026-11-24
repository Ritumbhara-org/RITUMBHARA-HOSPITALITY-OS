import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/guard"
import { ActionForm } from "@/components/hk/action-form"
import { Input } from "@/components/ui/input"
import { decideHkExemption } from "@/app/actions/hk-admin"

export const metadata = { title: "Guest already present" }

const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })

export default async function ExemptionsPage() {
  await requireAdminPage("/hk-admin/exemptions")
  const [pending, decided] = await Promise.all([
    prisma.hkExemption.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { unit: { select: { name: true } }, hkUser: { select: { name: true } } } }),
    prisma.hkExemption.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 20, include: { unit: { select: { name: true } }, hkUser: { select: { name: true } } } }),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Guest already present</h1>
      <p className="text-sm text-muted-foreground">An approved request counts as done for that unit and day. It does not hurt the housekeeper&apos;s bonus.</p>
      <section className="space-y-3">
        <h2 className="font-semibold">Waiting for you</h2>
        {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
        {pending.map((x) => (
          <div key={x.id} className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">{x.unit.name} · {fmtDay(x.day)}</p>
              <p className="text-xs text-muted-foreground">{x.hkUser.name}</p>
              <p className="mt-1 text-sm">{x.reason}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <ActionForm action={decideHkExemption.bind(null, x.id, true)} submitLabel="Approve" className="flex flex-wrap items-end gap-2">
                <Input name="note" placeholder="Note (optional)" className="w-56" />
              </ActionForm>
              <ActionForm action={decideHkExemption.bind(null, x.id, false)} submitLabel="Reject" variant="outline" className="flex flex-wrap items-end gap-2">
                <Input name="note" placeholder="Why rejected" className="w-56" />
              </ActionForm>
            </div>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Recently decided</h2>
        <div className="divide-y rounded-lg border">
          {decided.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing yet.</p>}
          {decided.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>{x.unit.name} · {fmtDay(x.day)} · {x.hkUser.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{x.status === "APPROVED" ? "Approved" : "Rejected"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
