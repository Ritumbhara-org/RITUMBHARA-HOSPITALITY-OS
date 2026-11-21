import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/guard"
import { ActionForm } from "@/components/hk/action-form"
import { Textarea } from "@/components/ui/textarea"
import { approveHkTurnover, rejectHkTurnover, reopenHkTurnover } from "@/app/actions/hk-admin"

export const metadata = { title: "Review turnovers" }

const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })

export default async function ReviewPage() {
  await requireAdminPage("/hk-admin/review")
  const turnovers = await prisma.hkTurnover.findMany({
    where: { status: "SUBMITTED" },
    orderBy: { checkInAt: "asc" },
    take: 30,
    include: {
      unit: { select: { name: true } },
      location: { select: { name: true } },
      hkUser: { select: { name: true } },
      template: { include: { areas: { orderBy: { sortOrder: "asc" } } } },
      submissions: { orderBy: { receivedAt: "asc" } },
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Review turnovers</h1>
      <p className="text-sm text-muted-foreground">Oldest first. Approve if every area shows clean proof. Rejecting fails that month&apos;s bonus unless you reopen it for a redo.</p>
      {turnovers.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>}
      {turnovers.map((t) => (
        <section key={t.id} className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{t.unit.name} · {t.location.name}</p>
              <p className="text-xs text-muted-foreground">
                {t.hkUser.name} · in {fmt(t.checkInAt)}{t.checkOutAt ? ` · out ${fmt(t.checkOutAt)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionForm action={approveHkTurnover.bind(null, t.id)} submitLabel="Approve" resetOnSuccess={false} />
              <ActionForm action={reopenHkTurnover.bind(null, t.id)} submitLabel="Send back for redo" variant="outline" resetOnSuccess={false} />
            </div>
          </div>

          {t.template.areas.map((a) => {
            const subs = t.submissions.filter((s) => s.areaId === a.id)
            return (
              <div key={a.id} className="space-y-2">
                <p className="text-sm font-medium">{a.title}</p>
                <div className="flex flex-wrap gap-2">
                  {subs.length === 0 && <span className="text-xs text-red-600">No proof</span>}
                  {subs.map((s) =>
                    s.kind === "VIDEO" ? (
                      <video key={s.id} src={s.mediaUrl} controls preload="none" className="h-40 rounded border" />
                    ) : (
                      <a key={s.id} href={s.mediaUrl} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.mediaUrl} alt={a.title} loading="lazy" className="h-40 rounded border object-cover" />
                      </a>
                    )
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {subs.map((s) => `${s.kind === "VIDEO" ? "Video" : "Photo"} ${fmt(s.capturedAtClient)}`).join(" · ")}
                </p>
              </div>
            )
          })}

          <ActionForm action={rejectHkTurnover.bind(null, t.id)} submitLabel="Reject" variant="destructive" className="space-y-2 border-t pt-3">
            <Textarea name="note" placeholder="Why is this rejected? The housekeeper sees this." rows={2} required />
          </ActionForm>
        </section>
      ))}
    </div>
  )
}
