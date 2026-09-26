import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: { guest: { include: { membership: true } } }
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (reservation.guest.membership) {
      return NextResponse.json({ error: "Already a member" }, { status: 400 });
    }

    // Assign points based on the current booking amount
    // E.g., 1 point per $10 spent
    const earnedPoints = Math.floor(reservation.totalAmount / 10);

    const membership = await prisma.membership.create({
      data: {
        guestId: reservation.guestId,
        tier: "SILVER",
        points: earnedPoints, // They immediately earn points for this stay!
      }
    });

    return NextResponse.json({ success: true, membership });
  } catch (error: any) {
    console.error("[Membership Join Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
