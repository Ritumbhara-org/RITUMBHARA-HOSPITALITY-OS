import { prisma } from "@/lib/prisma";
import { LocationsClient } from "@/components/locations/locations-client";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
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
