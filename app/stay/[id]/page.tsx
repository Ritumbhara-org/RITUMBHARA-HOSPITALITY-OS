import { prisma } from "@/lib/prisma";
import { systemWhatsAppNumber } from "@/lib/whatsapp/meta/config";
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
          membership: {
            include: {
              transactions: {
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: { id: true, amount: true, description: true, createdAt: true }
              }
            }
          }
        }
      }
    }
  });

  if (!reservation) {
    notFound();
  }

  // The number guests message: Meta's when Meta is the active provider, else Twilio's.
  const whatsappNumber = systemWhatsAppNumber().replace('+', '');

  return <GuestPortalClient reservation={reservation} whatsappNumber={whatsappNumber} />;
}
