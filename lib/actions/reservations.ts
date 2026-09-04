"use server";

import { prisma } from "@/lib/prisma";
import { withAction } from "@/lib/api-response";
import { ReservationSchema, ReservationInput } from "@/lib/validations";
import { revalidatePath } from "next/cache";

export async function getReservations() {
  return withAction(async () => {
    return prisma.reservation.findMany({
      include: {
        guest: true,
        unit: true,
      },
      orderBy: { checkIn: "asc" },
    });
  }, "getReservations");
}

export async function createReservation(input: ReservationInput) {
  return withAction(async () => {
    const data = ReservationSchema.parse(input);
    const reservation = await prisma.reservation.create({
      data,
    });
    revalidatePath("/reservations");
    return reservation;
  }, "createReservation");
}
