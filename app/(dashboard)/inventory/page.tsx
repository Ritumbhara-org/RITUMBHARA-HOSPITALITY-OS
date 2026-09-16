import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { getInventoryItems } from "@/app/actions/inventory"
import { InventoryClient } from "@/components/inventory/inventory-client"

export default async function InventoryPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")
  
  if (!token) {
    redirect("/login")
  }

  // Get current user and property
  const user = await prisma.teamMember.findUnique({
    where: { id: token.value },
    include: { property: true }
  });

  if (!user || !user.propertyId) {
    redirect("/login")
  }

  const items = await getInventoryItems(user.propertyId)

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Inventory Engine</h2>
      </div>
      <InventoryClient 
        initialItems={items} 
        propertyId={user.propertyId} 
        reporterId={user.id} 
      />
    </div>
  )
}
