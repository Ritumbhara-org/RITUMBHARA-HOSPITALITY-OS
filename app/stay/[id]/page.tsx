import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GuestPortalClient } from "@/components/guest-portal/guest-portal-client";

export const dynamic = "force-dynamic";

export default async function StayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      unit: {
        include: {
          property: true
        }
      },
      guest: {
        include: {
          membership: true
        }
      }
    }
  });

  if (!reservation) {
    notFound();
  }

  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER?.replace('+', '') || '';

  return <GuestPortalClient reservation={reservation} whatsappNumber={whatsappNumber} />;
}
