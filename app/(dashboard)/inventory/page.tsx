import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getInventoryItems } from "@/app/actions/inventory"
import { InventoryClient } from "@/components/inventory/inventory-client"
import { getSession } from "@/app/actions/auth"

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession();
  const user = session?.user;
  
  if (!user) {
    redirect('/login');
  }

  const isStaff = user.role === 'STAFF';
  const propertyFilter = isStaff && user.propertyId ? { id: user.propertyId } : {};

  // Fetch properties (filtered by STAFF)
  const properties = await prisma.property.findMany({
    where: propertyFilter,
    orderBy: { name: 'asc' }
  });

  if (properties.length === 0) {
    return <div className="p-8">No properties found. Please create a property first.</div>
  }

  // Resolve searchParams promise for Next.js 15
  const resolvedParams = await searchParams;
  const paramPropertyId = resolvedParams?.propertyId as string | undefined;

  // Determine which property to show: 
  // 1. If STAFF, always their own.
  // 2. The one selected in the URL
  // 3. The first property in the database
  const activePropertyId = isStaff && user.propertyId ? user.propertyId : (paramPropertyId || properties[0].id);
  
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
        reporterId={user.id}
        userRole={user.role}
      />
    </div>
  )
}
