import { requireAdminPage } from "@/lib/auth/guard"
import { prisma } from "@/lib/prisma"
import { ActionForm } from "@/components/hk/action-form"
import { LatLngFields } from "@/components/hk/latlng-fields"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createHkLocation, setHkLocationActive } from "@/app/actions/hk-admin"

export const metadata = { title: "HK locations" }

export default async function HkLocationsPage() {
  await requireAdminPage("/hk-admin/locations")
  const [locations, properties] = await Promise.all([
    prisma.hkLocation.findMany({
      orderBy: { createdAt: "asc" },
      include: { property: { select: { name: true, _count: { select: { units: true } } } }, _count: { select: { assignments: true } } },
    }),
    prisma.property.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-xl font-bold">Locations</h1>
        <p className="text-sm text-muted-foreground">
          A location is a property with a map pin and a check-in radius. Housekeepers can only check in inside it.
        </p>
        <div className="divide-y rounded-lg border">
          {locations.length === 0 && <p className="p-4 text-sm text-muted-foreground">No locations yet.</p>}
          {locations.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {l.name} {!l.isActive && <span className="text-xs text-red-600">(inactive)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.property.name} · {l.property._count.units} units · {l.radiusM} m radius · {l._count.assignments} housekeeper(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
                </p>
              </div>
              <ActionForm
                action={setHkLocationActive.bind(null, l.id, !l.isActive)}
                submitLabel={l.isActive ? "Deactivate" : "Activate"}
                variant="outline"
                resetOnSuccess={false}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Add a location</h2>
        <ActionForm action={createHkLocation} submitLabel="Add location" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="propertyId">Property</Label>
            <select id="propertyId" name="propertyId" required className="h-9 w-full rounded-lg border bg-transparent px-2 text-sm">
              <option value="">Select a property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Location name</Label>
            <Input id="name" name="name" required placeholder="Wonder Megacity, Alwar" />
          </div>
          <LatLngFields />
          <div className="space-y-1.5">
            <Label htmlFor="radiusM">Check-in radius (metres)</Label>
            <Input id="radiusM" name="radiusM" type="number" min={30} max={1000} defaultValue={150} required />
          </div>
        </ActionForm>
      </section>
    </div>
  )
}
