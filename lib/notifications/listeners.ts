// Turns event-bus events into admin notifications (the bell in the top bar).
// Registered once from the event bus next to the WhatsApp and housekeeping listeners. Handlers never throw,
// and none of them sends anything to guests or staff: they only add a row to the admin feed.

import { eventBus, type BookingEventPayload, type PointsRedemptionPayload, type SlaBreachPayload } from "@/lib/events/bus"
import { prisma } from "@/lib/prisma"
import { notifyAdmin } from "./service"
import { bookingCancelled, bookingCreated, pointsRedeemed, slaBreached, ticketCreated, type BookingFacts } from "./builders"

async function loadBooking(reservationId: string): Promise<BookingFacts | null> {
  const r = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { guest: true, unit: true },
  })
  if (!r) return null
  return {
    guestName: r.guest?.name || "Guest",
    unitName: r.unit?.name || "Unit",
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    source: r.source,
    totalAmount: r.totalAmount,
    propertyId: r.propertyId,
  }
}

export function initNotificationListeners() {
  // New booking. Stays that already ended are skipped, so a big historical import does not flood the bell.
  eventBus.on<BookingEventPayload>("BOOKING_CREATED", async (payload) => {
    try {
      if (payload.checkOut.getTime() < Date.now()) return
      const booking = await loadBooking(payload.reservationId)
      if (booking) await notifyAdmin(bookingCreated(booking))
    } catch (error) {
      console.error("[Notification Listener Error - BOOKING_CREATED]", error)
    }
  })

  // Cancelled booking: the admin may need to free the unit, refund or contact the guest.
  eventBus.on<BookingEventPayload>("BOOKING_CANCELLED", async (payload) => {
    try {
      if (payload.checkOut.getTime() < Date.now()) return
      const booking = await loadBooking(payload.reservationId)
      if (booking) await notifyAdmin(bookingCancelled(booking))
    } catch (error) {
      console.error("[Notification Listener Error - BOOKING_CANCELLED]", error)
    }
  })

  // A guest raised a request or complaint (portal form, portal chat, WhatsApp AI chat).
  eventBus.on<{ ticketId: string; propertyId: string; category?: string; priority: string; description: string }>("TICKET_CREATED", async (payload) => {
    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: payload.ticketId }, include: { unit: true } })
      await notifyAdmin(
        ticketCreated({
          ticketId: payload.ticketId,
          description: payload.description,
          priority: payload.priority,
          category: payload.category,
          unitName: ticket?.unit?.name ?? null,
          propertyId: payload.propertyId,
        }),
      )
    } catch (error) {
      console.error("[Notification Listener Error - TICKET_CREATED]", error)
    }
  })

  // A ticket passed its deadline.
  eventBus.on<SlaBreachPayload>("SLA_BREACHED", async (payload) => {
    try {
      const unit = payload.unitId ? await prisma.unit.findUnique({ where: { id: payload.unitId } }) : null
      await notifyAdmin(slaBreached({ ticketId: payload.ticketId, description: payload.description, priority: payload.priority, unitName: unit?.name ?? null }))
    } catch (error) {
      console.error("[Notification Listener Error - SLA_BREACHED]", error)
    }
  })

  // A guest redeemed loyalty points: front desk must deduct the amount from the bill.
  eventBus.on<PointsRedemptionPayload>("POINTS_REDEEMED", async (payload) => {
    try {
      const guest = await prisma.guest.findUnique({ where: { id: payload.guestId } })
      await notifyAdmin(pointsRedeemed({ guestName: guest?.name ?? null, pointsRedeemed: payload.pointsRedeemed, rupeeDiscount: payload.rupeeDiscount }))
    } catch (error) {
      console.error("[Notification Listener Error - POINTS_REDEEMED]", error)
    }
  })
}
