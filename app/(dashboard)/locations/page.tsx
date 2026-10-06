import { prisma } from "@/lib/prisma";
import { LocationsClient } from "@/components/locations/locations-client";

import { getSession } from "@/app/actions/auth";

export const revalidate = 15;

export default async function LocationsPage() {
  const session = await getSession();
  const isStaff = session?.user?.role === 'STAFF';
  const propertyFilter = isStaff && session?.user?.propertyId ? { id: session.user.propertyId } : {};
  const properties = await prisma.property.findMany({
    where: propertyFilter,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { units: true, teamMembers: true }
      }
    }
  });

  return <LocationsClient initialLocations={properties} userRole={session?.user?.role} />;
}
