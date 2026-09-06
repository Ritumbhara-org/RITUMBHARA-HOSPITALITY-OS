import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const CreatePropertySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().default("India"),
  phone: z.string().min(1),
  email: z.string().email(),
  timezone: z.string().default("Asia/Kolkata"),
})

// GET /api/properties — list properties
export async function GET() {
  try {
    const properties = await prisma.property.findMany({
      include: {
        _count: { select: { units: true, reservations: true, teamMembers: true, tickets: true } }
      },
      orderBy: { name: "asc" }
    })

    return NextResponse.json({ success: true, data: properties })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/properties — create a property
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreatePropertySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const property = await prisma.property.create({ data: parsed.data })
    return NextResponse.json({ success: true, data: property }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
