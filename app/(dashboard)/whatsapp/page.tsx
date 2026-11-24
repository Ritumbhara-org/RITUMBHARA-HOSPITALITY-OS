import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getWhatsAppConversations, getBroadcastCampaigns } from "@/app/actions/whatsapp"
import { WhatsAppClient } from "@/components/whatsapp/whatsapp-client"

import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/guard"

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireAdminPage("/whatsapp")
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")

  // Fallback to first admin for demo purposes
  let user = null;
  if (token) {
    user = await prisma.teamMember.findUnique({
      where: { id: token.value }
    });
  }

  if (!user) {
    user = await prisma.teamMember.findFirst({
      orderBy: { createdAt: 'asc' }
    });
  }

  const properties = await prisma.property.findMany({
    orderBy: { name: 'asc' }
  });

  const resolvedParams = await searchParams;
  // Defaults to all locations; a location picked in the selector comes through the URL.
  const activePropertyId = (resolvedParams?.propertyId as string) || 'ALL';

  const threads = await getWhatsAppConversations()
  const broadcasts = await getBroadcastCampaigns(activePropertyId)

  return (
    <div className="flex min-h-0 flex-1 flex-col md:h-[calc(100dvh-4rem)] md:flex-none">
      <WhatsAppClient 
        initialThreads={threads} 
        initialBroadcasts={broadcasts}
        properties={properties} 
        activePropertyId={activePropertyId} 
      />
    </div>
  )
}
