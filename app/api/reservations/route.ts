import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const CreateReservationSchema = z.object({
  guestId: z.string().min(1, "Guest ID is required"),
  unitId: z.string().min(1, "Unit ID is required"),
  propertyId: z.string().min(1, "Property ID is required"),
  checkIn: z.string().datetime({ offset: true }).or(z.string().date()),
  checkOut: z.string().datetime({ offset: true }).or(z.string().date()),
  status: z.enum(["PENDING", "CONFIRMED", "ARRIVING", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"]).default("CONFIRMED"),
  source: z.string().default("DIRECT"),
  totalAmount: z.number().min(0).default(0),
  bookingNotes: z.string().optional().nullable(),
})

// GET /api/reservations — list reservations
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const propertyId = searchParams.get("propertyId")
    const limit = parseInt(searchParams.get("limit") || "50")
    const page = parseInt(searchParams.get("page") || "1")

    const where: any = {}
    if (status) where.status = status
    if (propertyId) where.propertyId = propertyId

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          guest: { select: { id: true, name: true, phone: true, email: true } },
          unit: { select: { id: true, name: true, type: true } },
        },
        orderBy: { checkIn: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.reservation.count({ where })
    ])

    return NextResponse.json({ success: true, data: reservations, meta: { total, page, limit } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/reservations — create a reservation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateReservationSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { checkIn, checkOut, ...rest } = parsed.data

    const reservation = await prisma.reservation.create({
      data: {
        ...rest,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
      },
      include: {
        guest: { select: { name: true, phone: true } },
        unit: { select: { name: true } },
      }
    })

    return NextResponse.json({ success: true, data: reservation }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
