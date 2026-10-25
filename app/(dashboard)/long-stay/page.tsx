import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/guard"
import { LongStayList } from "@/components/long-stay/long-stay-list"
import { agreementBadge } from "@/lib/long-stay/agreement"
import { toDateOnly } from "@/lib/long-stay/shared"
import type { LongStayRow } from "@/lib/long-stay/view"

export const dynamic = "force-dynamic"

export default async function LongStaysPage() {
  await requireAdminPage("/long-stay")

  const [bookings, locations] = await Promise.all([
    prisma.longStayBooking.findMany({
      orderBy: { checkIn: "desc" },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { name: true } },
        agreements: { select: { status: true, expiresAt: true, lockedAt: true, createdAt: true } },
      },
    }),
    prisma.property.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  const rows: LongStayRow[] = bookings.map((b) => ({
    id: b.id,
    guestName: b.guestName,
    contactNumber: b.contactNumber,
    unitName: b.unit?.name ?? null,
    locationId: b.property.id,
    locationName: b.property.name,
    checkIn: toDateOnly(b.checkIn),
    checkOut: toDateOnly(b.checkOut),
    nights: b.nights,
    inclusion: b.inclusion,
    totalAmount: b.totalAmount,
    securityDeposit: b.securityDeposit,
    depositRefundedOn: b.depositRefundedOn ? toDateOnly(b.depositRefundedOn) : null,
    checkInCount: b.checkInMedia.length,
    checkOutCount: b.checkOutMedia.length,
    status: b.status,
    agreement: agreementBadge(b.agreements),
  }))

  const held = bookings.filter((b) => b.status !== "CANCELLED" && !b.depositRefundedOn && b.securityDeposit > 0)
  const stats = {
    staying: bookings.filter((b) => b.status === "CHECKED_IN").length,
    upcoming: bookings.filter((b) => b.status === "UPCOMING").length,
    depositsHeld: held.reduce((sum, b) => sum + b.securityDeposit, 0),
    depositsHeldCount: held.length,
  }

  return <LongStayList rows={rows} stats={stats} locations={locations} />
}
