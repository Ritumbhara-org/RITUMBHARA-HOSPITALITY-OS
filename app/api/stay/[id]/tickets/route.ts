import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events/bus";
import { TicketCategory, TicketPriority } from "@prisma/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { category, description, priority } = body;

    if (!category || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { unit: true }
    });

    if (!reservation) {
      return NextResponse.json({ error: "Stay not found" }, { status: 404 });
    }

    // Set SLAs based on Priority
    const slaHours = priority === "URGENT" ? 1 : priority === "HIGH" ? 2 : priority === "MEDIUM" ? 4 : 24;
    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + slaHours);

    const ticket = await prisma.ticket.create({
      data: {
        propertyId: reservation.unit.propertyId,
        unitId: reservation.unitId,
        guestId: reservation.guestId,
        reporterId: reservation.guestId,
        reporterType: "GUEST",
        category: category as TicketCategory,
        description,
        priority: (priority as TicketPriority) || "MEDIUM",
        slaDeadline,
        status: "OPEN"
      }
    });

    // Record audit log
    await prisma.ticketAuditLog.create({
      data: {
        ticketId: ticket.id,
        action: "CREATED_BY_GUEST",
        actorId: reservation.guestId,
        actorType: "GUEST",
        toStatus: "OPEN"
      }
    });

    // Fire the event to trigger assignment and WhatsApp notification
    eventBus.emit('TICKET_CREATED', {
      ticketId: ticket.id,
      propertyId: ticket.propertyId,
      category: ticket.category,
      priority: ticket.priority,
      description: ticket.description
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error: any) {
    console.error("[Guest Ticket Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
