import { prisma } from "@/lib/prisma";
import { LocationsClient } from "@/components/locations/locations-client";
import { requireAdminPage } from "@/lib/auth/guard"

export const revalidate = 15;

export default async function LocationsPage() {
  await requireAdminPage("/locations")
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { units: true, teamMembers: true }
      }
    }
  });

  return <LocationsClient initialLocations={properties} />;
}
