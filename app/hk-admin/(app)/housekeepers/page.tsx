import { prisma } from "@/lib/prisma"
import { ActionForm } from "@/components/hk/action-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createHkUser, resetHkUserPin, setHkAssignments, setHkUserActive } from "@/app/actions/hk-admin"

export const metadata = { title: "Housekeepers" }

export default async function HousekeepersPage() {
  const [users, locations] = await Promise.all([
    prisma.hkUser.findMany({ orderBy: { createdAt: "asc" }, include: { assignments: { select: { locationId: true } } } }),
    prisma.hkLocation.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-xl font-bold">Housekeepers</h1>
        <p className="text-sm text-muted-foreground">They sign in at /hk with their mobile number and the PIN you set here.</p>
        <div className="space-y-4">
          {users.length === 0 && <p className="text-sm text-muted-foreground">No housekeepers yet.</p>}
          {users.map((u) => {
            const assigned = new Set(u.assignments.map((a) => a.locationId))
            const locked = u.lockedUntil && u.lockedUntil > new Date()
            return (
              <div key={u.id} className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {u.name} {!u.isActive && <span className="text-xs text-red-600">(inactive)</span>}
                      {locked && <span className="ml-2 text-xs text-amber-600">(locked, wrong PIN too often)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.mobile}</p>
                    <p className="text-xs text-muted-foreground">
                      Last sign-in: {u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "never"}
                    </p>
                  </div>
                  <ActionForm
                    action={setHkUserActive.bind(null, u.id, !u.isActive)}
                    submitLabel={u.isActive ? "Deactivate" : "Activate"}
                    variant="outline"
                    resetOnSuccess={false}
                  />
                </div>

                <ActionForm action={setHkAssignments.bind(null, u.id)} submitLabel="Save locations" className="space-y-2" resetOnSuccess={false}>
                  <p className="text-sm font-medium">Assigned locations</p>
                  <div className="flex flex-wrap gap-4">
                    {locations.length === 0 && <span className="text-xs text-muted-foreground">Add a location first.</span>}
                    {locations.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="locationIds" value={l.id} defaultChecked={assigned.has(l.id)} />
                        {l.name}
                      </label>
                    ))}
                  </div>
                </ActionForm>

                <ActionForm action={resetHkUserPin.bind(null, u.id)} submitLabel="Reset PIN" variant="outline" className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`pin-${u.id}`}>New PIN</Label>
                    <Input id={`pin-${u.id}`} name="pin" inputMode="numeric" maxLength={6} pattern="\d{4,6}" required className="w-32" />
                  </div>
                </ActionForm>
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Add a housekeeper</h2>
        <ActionForm action={createHkUser} submitLabel="Add housekeeper" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mobile">Mobile number</Label>
            <Input id="mobile" name="mobile" type="tel" inputMode="numeric" required placeholder="98765 43210" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN (4 to 6 digits)</Label>
            <Input id="pin" name="pin" inputMode="numeric" maxLength={6} pattern="\d{4,6}" required className="w-32" />
          </div>
        </ActionForm>
      </section>
    </div>
  )
}
