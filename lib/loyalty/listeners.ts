// Booking events -> loyalty. Earning, adjustment and reversal are idempotent (lib/loyalty/earning.ts), so duplicate
// events are harmless; the scheduled loyalty job re-checks recent bookings as a safety net.

import { eventBus, type BookingEventPayload } from "@/lib/events/bus"
import { ensureMembership } from "./members"
import { reconcileReservation } from "./earning"
import { prisma } from "@/lib/prisma"

export function initLoyaltyListeners() {
  const reconcile = async (p: BookingEventPayload) => {
    try {
      await reconcileReservation(p.reservationId)
    } catch (e) {
      console.error("[Loyalty listener]", e)
    }
  }
  eventBus.on<BookingEventPayload>("GUEST_CHECKED_OUT", reconcile)
  eventBus.on<BookingEventPayload>("BOOKING_CANCELLED", reconcile)
  eventBus.on<BookingEventPayload>("BOOKING_UPDATED", reconcile)
  // Every guest becomes a Star member with their first booking.
  eventBus.on<BookingEventPayload>("BOOKING_CREATED", async (p) => {
    try {
      const g = await prisma.guest.findUnique({ where: { id: p.guestId } })
      if (g) await ensureMembership({ phone: g.phone, name: g.name, guestId: g.id })
    } catch (e) {
      console.error("[Loyalty listener]", e)
    }
  })
}
