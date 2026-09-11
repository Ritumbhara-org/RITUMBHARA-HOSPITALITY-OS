import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { GuestProfileClient } from "./guest-profile-client"

export const dynamic = 'force-dynamic'

export default async function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      membership: true,
      reservations: {
        include: { unit: true, property: true },
        orderBy: { checkIn: "desc" },
      },
      tickets: {
        include: { unit: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!guest) {
    notFound()
  }

  // Calculate some stats
  const totalSpend = guest.reservations.reduce((sum, res) => sum + (res.totalAmount || 0), 0)
  const totalStays = guest.reservations.filter(res => ["CHECKED_IN", "CHECKED_OUT"].includes(res.status)).length

  return <GuestProfileClient guest={guest} totalSpend={totalSpend} totalStays={totalStays} />
}
