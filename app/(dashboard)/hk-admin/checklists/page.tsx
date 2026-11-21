import { requireAdminPage } from "@/lib/auth/guard"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { ActionForm } from "@/components/hk/action-form"
import { ReferenceMediaField } from "@/components/hk/reference-media-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { parseReferenceMedia } from "@/lib/hk/media"
import {
  createHkArea,
  createHkTemplate,
  deleteHkArea,
  setHkTemplateActive,
  updateHkAreaOrder,
} from "@/app/actions/hk-admin"

export const metadata = { title: "HK checklists" }

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>
}) {
  await requireAdminPage("/hk-admin/checklists")
  const { location: locationParam } = await searchParams
  const locations = await prisma.hkLocation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
  const current = locations.find((l) => l.id === locationParam) ?? locations[0]

  const templates = current
    ? await prisma.hkChecklistTemplate.findMany({
        where: { locationId: current.id },
        orderBy: { createdAt: "asc" },
        include: { areas: { orderBy: { sortOrder: "asc" } } },
      })
    : []

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-xl font-bold">Checklists</h1>
        <p className="text-sm text-muted-foreground">
          Each template is a list of areas. For every area, the housekeeper sees your reference media and must capture photos and a video.
        </p>
        {locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a location first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {locations.map((l) => (
              <Link
                key={l.id}
                href={`/hk-admin/checklists?location=${l.id}`}
                className={`rounded-full border px-3 py-1 text-sm ${l.id === current?.id ? "bg-foreground text-background" : ""}`}
              >
                {l.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {current && (
        <>
          {templates.map((t) => (
            <section key={t.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    {t.title} {!t.isActive && <span className="text-xs text-red-600">(inactive)</span>}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {t.unitType ? `For units of type "${t.unitType}"` : "For any unit at this location"}
                  </p>
                </div>
                <ActionForm
                  action={setHkTemplateActive.bind(null, t.id, !t.isActive)}
                  submitLabel={t.isActive ? "Deactivate" : "Activate"}
                  variant="outline"
                  resetOnSuccess={false}
                />
              </div>

              <div className="divide-y rounded-lg border">
                {t.areas.length === 0 && <p className="p-3 text-sm text-muted-foreground">No areas yet.</p>}
                {t.areas.map((a) => {
                  const media = parseReferenceMedia(a.referenceMedia)
                  return (
                    <div key={a.id} className="space-y-2 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.minPhotos} photo(s){a.requiresVideo ? " + video" : ""}
                          </p>
                          {a.instructions && <p className="mt-1 text-xs">{a.instructions}</p>}
                        </div>
                        <div className="flex items-end gap-2">
                          <ActionForm
                            action={updateHkAreaOrder.bind(null, a.id)}
                            submitLabel="Save order"
                            variant="outline"
                            className="flex items-end gap-2"
                            resetOnSuccess={false}
                          >
                            <Input name="sortOrder" type="number" defaultValue={a.sortOrder} className="w-20" aria-label="Order" />
                          </ActionForm>
                          <ActionForm action={deleteHkArea.bind(null, a.id)} submitLabel="Delete" variant="destructive" resetOnSuccess={false} />
                        </div>
                      </div>
                      {media.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {media.map((m) =>
                            m.kind === "PHOTO" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={m.url} src={m.url} alt="" className="h-20 w-20 rounded object-cover" />
                            ) : (
                              <video key={m.url} src={m.url} className="h-20 w-28 rounded object-cover" controls preload="metadata" />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <ActionForm action={createHkArea.bind(null, t.id)} submitLabel="Add area" className="space-y-3 rounded-lg bg-muted/40 p-3">
                <p className="text-sm font-medium">Add an area</p>
                <div className="space-y-1.5">
                  <Label htmlFor={`title-${t.id}`}>Area name</Label>
                  <Input id={`title-${t.id}`} name="title" required placeholder="Bathroom" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ins-${t.id}`}>Instructions (optional)</Label>
                  <Textarea id={`ins-${t.id}`} name="instructions" rows={2} />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`min-${t.id}`}>Photos required</Label>
                    <Input id={`min-${t.id}`} name="minPhotos" type="number" min={0} max={10} defaultValue={1} className="w-24" />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="requiresVideo" defaultChecked /> Video required
                  </label>
                </div>
                <ReferenceMediaField />
              </ActionForm>
            </section>
          ))}

          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="font-semibold">Add a template for {current.name}</h2>
            <ActionForm action={createHkTemplate} submitLabel="Add template" className="space-y-4">
              <input type="hidden" name="locationId" value={current.id} />
              <div className="space-y-1.5">
                <Label htmlFor="tpl-title">Template name</Label>
                <Input id="tpl-title" name="title" required placeholder="Studio turnover" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-type">Unit type (optional)</Label>
                <Input id="tpl-type" name="unitType" placeholder="Studio, or leave blank for any unit" />
              </div>
            </ActionForm>
          </section>
        </>
      )}
    </div>
  )
}
