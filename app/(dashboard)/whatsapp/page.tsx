import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getWhatsAppConversations, getBroadcastCampaigns } from "@/app/actions/whatsapp"
import { WhatsAppClient } from "@/components/whatsapp/whatsapp-client"

import { prisma } from "@/lib/prisma"

import { getSession } from "@/app/actions/auth"

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession();
  
  // Fallback to first admin for demo purposes
  let user = session?.user;

  if (!user) {
    user = await prisma.teamMember.findFirst({
      orderBy: { createdAt: 'asc' }
    });
  }

  const properties = await prisma.property.findMany({
    orderBy: { name: 'asc' }
  });

  const resolvedParams = await searchParams;
  const activePropertyId = resolvedParams?.propertyId as string 
    || (user?.role === 'ADMIN' ? 'ALL' : user?.propertyId) 
    || properties[0]?.id;

  const threads = await getWhatsAppConversations()
  const broadcasts = await getBroadcastCampaigns(activePropertyId)
  const knowledge = await prisma.locationKnowledge.findUnique({ where: { propertyId: activePropertyId } });

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <WhatsAppClient 
        initialThreads={threads} 
        initialBroadcasts={broadcasts}
        properties={properties} 
        activePropertyId={activePropertyId}
        initialKnowledge={knowledge}
        userRole={user?.role}
      />
    </div>
  )
}
