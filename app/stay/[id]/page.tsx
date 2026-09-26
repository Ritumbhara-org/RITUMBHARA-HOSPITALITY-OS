import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GuestPortalClient } from "@/components/guest-portal/guest-portal-client";

export default async function StayPage({ params }: { params: { id: string } }) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: {
      unit: {
        include: {
          property: true
        }
      },
      guest: true
    }
  });

  if (!reservation) {
    notFound();
  }

  return <GuestPortalClient reservation={reservation} />;
}
