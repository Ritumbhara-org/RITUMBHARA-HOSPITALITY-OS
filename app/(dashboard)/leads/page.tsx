import { prisma } from "@/lib/prisma"
import { loadLeads } from "@/lib/leads/service"
import { loadGuestMessages } from "@/lib/guest-messages/service"
import { LeadsClient } from "@/components/leads/leads-client"
import { requireAdminPage } from "@/lib/auth/guard"

// Always read the Sheet fresh: a status changed in the Sheet or by a teammate must show on the next load.
export const dynamic = "force-dynamic"

export default async function LeadsPage() {
  await requireAdminPage("/leads")
  // Leads and the Week 7 Guest Messages are read side by side from the same Sheet; each has its own data and section.
  const [result, guestMessages] = await Promise.all([
    loadLeads({
      findGuestsByPhone: (phones) =>
        prisma.guest.findMany({
          where: { phone: { in: phones } },
          select: { id: true, name: true, phone: true },
          orderBy: { updatedAt: "desc" },
        }),
    }),
    loadGuestMessages(),
  ])
  return <LeadsClient data={result} guestMessages={guestMessages} />
}
