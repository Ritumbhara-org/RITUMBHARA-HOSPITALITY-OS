import { prisma } from "@/lib/prisma"
import { loadLeads } from "@/lib/leads/service"
import { LeadsClient } from "@/components/leads/leads-client"
import { requireAdminPage } from "@/lib/auth/guard"

// Always read the Sheet fresh: a status changed in the Sheet or by a teammate must show on the next load.
export const dynamic = "force-dynamic"

export default async function LeadsPage() {
  await requireAdminPage("/leads")
  const result = await loadLeads({
    findGuestsByPhone: (phones) =>
      prisma.guest.findMany({
        where: { phone: { in: phones } },
        select: { id: true, name: true, phone: true },
        orderBy: { updatedAt: "desc" },
      }),
  })
  return <LeadsClient data={result} />
}
