import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const CreateUnitSchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  floor: z.string().default("1"),
  capacity: z.number().int().min(1).default(2),
  status: z.enum(["AVAILABLE", "OCCUPIED", "DIRTY", "CLEANING", "READY", "MAINTENANCE"]).default("AVAILABLE"),
  amenities: z.array(z.string()).optional(),
})

// GET /api/units — list units
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get("propertyId")
    const status = searchParams.get("status")

    const where: any = {}
    if (propertyId) where.propertyId = propertyId
    if (status) where.status = status

    const units = await prisma.unit.findMany({
      where,
      include: {
        _count: { select: { reservations: true, tickets: true } }
      },
      orderBy: { name: "asc" }
    })

    return NextResponse.json({ success: true, data: units, meta: { total: units.length } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/units — create a unit
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateUnitSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { amenities, ...rest } = parsed.data

    const unit = await prisma.unit.create({
      data: {
        ...rest,
        amenities: amenities || [],
      }
    })

    return NextResponse.json({ success: true, data: unit }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
