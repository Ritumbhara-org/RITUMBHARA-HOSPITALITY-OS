"use server";

import { prisma } from "@/lib/prisma";
import { withAction } from "@/lib/api-response";
import { TicketSchema, TicketInput } from "@/lib/validations";
import { revalidatePath } from "next/cache";

export async function getTickets() {
  return withAction(async () => {
    return prisma.ticket.findMany({
      include: {
        property: true,
        unit: true,
        assignedTo: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }, "getTickets");
}

export async function createTicket(input: TicketInput) {
  return withAction(async () => {
    const data = TicketSchema.parse(input);
    const ticket = await prisma.ticket.create({
      data,
    });
    revalidatePath("/operations");
    return ticket;
  }, "createTicket");
}
