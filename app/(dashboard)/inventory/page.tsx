import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { getInventoryItems } from "@/app/actions/inventory"
import { InventoryClient } from "@/components/inventory/inventory-client"

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")

  // Try to get current user from token, or fallback to the first admin for demo purposes
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

  // Fetch all properties available
  const properties = await prisma.property.findMany({
    orderBy: { name: 'asc' }
  });

  if (properties.length === 0) {
    return <div className="p-8">No properties found. Please create a property first.</div>
  }

  // Resolve searchParams promise for Next.js 15
  const resolvedParams = await searchParams;
  const paramPropertyId = resolvedParams?.propertyId as string | undefined;

  // Determine which property to show: 
  // 1. The one selected in the URL
  // 2. The user's assigned property
  // 3. The first property in the database
  const activePropertyId = paramPropertyId || user?.propertyId || properties[0].id;
  
  // Fetch items for the active property
  const items = await getInventoryItems(activePropertyId)

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Inventory Engine</h2>
      </div>
      <InventoryClient 
        initialItems={items} 
        activePropertyId={activePropertyId}
        properties={properties}
        reporterId={user?.id || "system"} 
      />
    </div>
  )
}
