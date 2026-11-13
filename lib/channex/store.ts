// Prisma-backed pieces of the Channex integration: the mapping store and the reservation writes used by inbound bookings.
// Kept thin on purpose; the rules live in the pure modules (ari.ts, bookings.ts) which have unit tests.

import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/utils/phone"
import { eventBus } from "@/lib/events/bus"
import type { ApplyDeps, NativeBookingInput } from "./bookings"
import type { MappingStore } from "./mapping"
import type { ChannexEntityKind } from "./types"

type Db = typeof prisma

export class PrismaMappingStore implements MappingStore {
  constructor(private db: Db = prisma) {}
  async get(kind: ChannexEntityKind, localId: string) {
    const row = await this.db.channexMapping.findUnique({ where: { kind_localId: { kind, localId } } })
    return row?.channexId ?? null
  }
  async getLocal(kind: ChannexEntityKind, channexId: string) {
    const row = await this.db.channexMapping.findFirst({ where: { kind, channexId } })
    return row?.localId ?? null
  }
  async set(kind: ChannexEntityKind, localId: string, channexId: string) {
    await this.db.channexMapping.upsert({
      where: { kind_localId: { kind, localId } },
      create: { kind, localId, channexId },
      update: { channexId },
    })
  }
}

// Check-in / check-out clock times for OTA stays. India only for now; make these per-property when a non-IST property is added.
const CHECK_IN_TIME = "14:00:00+05:30"
const CHECK_OUT_TIME = "11:00:00+05:30"

/** Emitting booking events triggers guest WhatsApp messages and housekeeping. Off by default so staging test bookings stay silent. */
const emitEvents = () => process.env.CHANNEX_EMIT_EVENTS === "true"

async function findOrCreateGuest(db: Db, c: { name: string; email: string | null; phone: string | null }) {
  const phone = normalizePhoneNumber(c.phone)
  const or: { phone?: string; email?: string }[] = []
  if (phone) or.push({ phone })
  if (c.email) or.push({ email: c.email })
  const existing = or.length ? await db.guest.findFirst({ where: { OR: or } }) : null
  if (existing) return existing
  // OTAs often hide the real phone number. Use a placeholder rather than failing the booking.
  return db.guest.create({ data: { name: c.name, phone: phone || "0000000000", email: c.email } })
}

export function buildApplyDeps(db: Db = prisma, store: MappingStore = new PrismaMappingStore(db)): ApplyDeps {
  return {
    store,

    async createReservation(input: NativeBookingInput) {
      const { revision, propertyLocalId, roomTypeLocalId, room, checkIn, checkOut } = input
      if (!roomTypeLocalId) throw new Error(`Revision ${revision.revisionId}: room type ${room.roomTypeId} is not mapped to a local room type`)
      const units = await db.unit.findMany({ where: { roomTypeId: roomTypeLocalId, propertyId: propertyLocalId }, orderBy: { name: "asc" } })
      if (!units.length) throw new Error(`Room type ${roomTypeLocalId} has no units; add rooms to it before taking bookings`)

      const start = new Date(`${checkIn}T${CHECK_IN_TIME}`)
      const end = new Date(`${checkOut}T${CHECK_OUT_TIME}`)
      const busy = await db.reservation.findMany({
        where: { unitId: { in: units.map((u) => u.id) }, status: { notIn: ["CANCELLED"] }, checkIn: { lt: end }, checkOut: { gt: start } },
        select: { unitId: true },
      })
      const busyIds = new Set(busy.map((b) => b.unitId))
      const free = units.find((u) => !busyIds.has(u.id))
      // Never drop an OTA booking: with no free room it is kept on the first unit and flagged.
      const unit = free ?? units[0]
      const overbooked = !free

      const guest = await findOrCreateGuest(db, revision.customer)
      const total = room.amount ?? revision.amount ?? 0
      const res = await db.reservation.create({
        data: {
          guestId: guest.id,
          unitId: unit.id,
          propertyId: propertyLocalId,
          roomTypeId: roomTypeLocalId,
          checkIn: start,
          checkOut: end,
          status: "CONFIRMED",
          source: "OTA",
          sourceDetail: revision.otaName,
          totalAmount: total,
          paymentStatus: revision.paymentCollect === "ota" ? "OTA_COLLECT" : "PAY_AT_PROPERTY",
          channexBookingId: revision.bookingId,
          otaName: revision.otaName,
          otaReservationCode: revision.otaReservationCode,
          nightlyRates: room.days,
          overbooked,
          reviewNote: overbooked ? "Overbooked: no free room when this OTA booking arrived. Reassign or contact the guest." : null,
          bookingNotes: revision.otaReservationCode ? `${revision.otaName ?? "OTA"} ref ${revision.otaReservationCode}` : null,
        },
      })
      if (emitEvents()) {
        await eventBus.emit("BOOKING_CREATED", { reservationId: res.id, guestId: guest.id, propertyId: propertyLocalId, intellistayBookingId: "channex", status: res.status, checkIn: start, checkOut: end })
      }
      return { reservationId: res.id, overbooked }
    },

    async cancelReservation(reservationId: string) {
      const res = await db.reservation.update({ where: { id: reservationId }, data: { status: "CANCELLED" } })
      if (emitEvents()) {
        await eventBus.emit("BOOKING_CANCELLED", { reservationId: res.id, guestId: res.guestId, propertyId: res.propertyId, intellistayBookingId: "channex", status: res.status, checkIn: res.checkIn, checkOut: res.checkOut })
      }
    },

    async flagModification(revision, reservationIds) {
      const note = `${revision.otaName ?? "OTA"} sent a change (${revision.arrivalDate ?? "?"} to ${revision.departureDate ?? "?"}, amount ${revision.amount ?? "?"}). Review and update the booking by hand.`
      if (reservationIds.length) await db.reservation.updateMany({ where: { id: { in: reservationIds } }, data: { reviewNote: note } })
      console.warn(`[channex] modification needs review: booking ${revision.bookingId} (${reservationIds.length} local reservations)`)
    },

    async markAvailabilityDirty() {
      // Availability is recomputed from reservations on every push; the cron / webhook caller pushes right after applying.
    },
  }
}

/** Dedupe/audit log. Never throws: logging must not break ingestion. */
export async function logRevision(db: Db, revisionId: string, bookingId: string, status: string, outcome: string | null, error: string | null) {
  try {
    await db.channexRevision.upsert({
      where: { revisionId },
      create: { revisionId, bookingId, status, outcome, error, appliedAt: error ? null : new Date() },
      update: { outcome, error, appliedAt: error ? null : new Date() },
    })
  } catch (e) {
    console.error("[channex] could not log revision", revisionId, e)
  }
}
