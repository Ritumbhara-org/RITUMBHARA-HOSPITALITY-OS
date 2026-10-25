import { notFound } from "next/navigation"
import { format } from "date-fns"
import { requireAdminPage } from "@/lib/auth/guard"
import { LongStayForm } from "@/components/long-stay/long-stay-form"
import { loadBookingForForm, loadFormOptions } from "@/lib/long-stay/queries"
import { isValidBookingId } from "@/lib/long-stay/shared"

export const dynamic = "force-dynamic"

export default async function LongStayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdminPage("/long-stay/" + encodeURIComponent(id))
  if (!isValidBookingId(id)) notFound()
  const [booking, { locations, units }] = await Promise.all([loadBookingForForm(id), loadFormOptions()])
  if (!booking) notFound()
  return (
    <LongStayForm
      key={id}
      mode="edit"
      initial={booking.input}
      initialStatus={booking.status}
      locations={locations}
      units={units}
      agreement={booking.agreement}
      createdAt={format(booking.createdAt, "d MMM yyyy")}
    />
  )
}
