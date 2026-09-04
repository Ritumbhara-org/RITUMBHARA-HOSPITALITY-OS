"use server";

import { prisma } from "@/lib/prisma";
import { withAction } from "@/lib/api-response";
import { GuestSchema, GuestInput } from "@/lib/validations";
import { revalidatePath } from "next/cache";

export async function getGuests() {
  return withAction(async () => {
    return prisma.guest.findMany({
      orderBy: { createdAt: "desc" },
    });
  }, "getGuests");
}

export async function createGuest(input: GuestInput) {
  return withAction(async () => {
    const data = GuestSchema.parse(input);
    const guest = await prisma.guest.create({
      data,
    });
    revalidatePath("/guests");
    return guest;
  }, "createGuest");
}
