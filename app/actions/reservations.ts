"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function updateReservationStatus(reservationId: string, status: string) {
  try {
    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: { status }
    })

    if (status === 'CHECKED_IN') {
      await prisma.unit.update({
        where: { id: reservation.unitId },
        data: { status: 'OCCUPIED' }
      })
    } else if (status === 'CHECKED_OUT') {
      await prisma.unit.update({
        where: { id: reservation.unitId },
        data: { status: 'DIRTY' }
      })
    } else if (status === 'CANCELLED') {
      // Basic fallback to AVAILABLE if cancelled, though might need more robust checks
      await prisma.unit.update({
        where: { id: reservation.unitId },
        data: { status: 'AVAILABLE' }
      })
    }

    revalidatePath("/reservations")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error: any) {
    console.error("Failed to update reservation status:", error)
    return { success: false, error: error.message }
  }
}

export async function createReservation(formData: FormData) {
  try {
    const guestId = formData.get("guestId") as string
    const unitId = formData.get("unitId") as string
    const checkIn = formData.get("checkIn") as string
    const checkOut = formData.get("checkOut") as string
    const source = formData.get("source") as string
    const totalAmount = parseFloat(formData.get("totalAmount") as string)
    const bookingNotes = formData.get("bookingNotes") as string

    if (!guestId || !unitId || !checkIn || !checkOut) {
      throw new Error("Guest, Unit, Check-in and Check-out are required.")
    }

    const defaultProperty = await prisma.property.findFirst()
    if (!defaultProperty) throw new Error("No property found.")

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    // Prevent double booking for the same unit
    const overlapping = await prisma.reservation.findFirst({
      where: {
        unitId,
        status: {
          notIn: ["CANCELLED"]
        },
        checkIn: { lt: checkOutDate },
        checkOut: { gt: checkInDate }
      }
    });

    if (overlapping) {
      throw new Error("This unit is already booked for the selected dates.");
    }

    await prisma.reservation.create({
      data: {
        guestId,
        unitId,
        propertyId: defaultProperty.id,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        status: "CONFIRMED",
        source: source || "DIRECT",
        totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
        bookingNotes: bookingNotes || null
      }
    })

    revalidatePath("/reservations")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error: any) {
    console.error("Failed to create reservation:", error)
    return { success: false, error: error.message }
  }
}

