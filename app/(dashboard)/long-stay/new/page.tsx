import { randomUUID } from "node:crypto"
import { requireAdminPage } from "@/lib/auth/guard"
import { LongStayForm } from "@/components/long-stay/long-stay-form"
import { loadFormOptions } from "@/lib/long-stay/queries"
import { emptyLongStayInput } from "@/lib/long-stay/shared"

export const dynamic = "force-dynamic"

export default async function NewLongStayPage() {
  await requireAdminPage("/long-stay/new")
  const { locations, units } = await loadFormOptions()
  // The id is picked now so photos uploaded before the first save land in this booking's folder.
  const id = "ls" + randomUUID().replace(/-/g, "")
  return <LongStayForm mode="new" initial={emptyLongStayInput(id)} initialStatus={null} locations={locations} units={units} agreement={null} />
}
