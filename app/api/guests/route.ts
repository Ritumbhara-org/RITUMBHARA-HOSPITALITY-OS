import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const CreateGuestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email().optional().nullable(),
  idType: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
})

// GET /api/guests — list all guests
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")
    const limit = parseInt(searchParams.get("limit") || "50")
    const page = parseInt(searchParams.get("page") || "1")

    const guests = await prisma.guest.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { email: { contains: search, mode: "insensitive" } },
        ]
      } : undefined,
      include: {
        membership: { select: { tier: true, points: true } },
        _count: { select: { reservations: true } }
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    })

    const total = await prisma.guest.count()

    return NextResponse.json({ 
      success: true, 
      data: guests, 
      meta: { total, page, limit } 
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/guests — create a guest
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateGuestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const guest = await prisma.guest.create({ data: parsed.data })

    return NextResponse.json({ success: true, data: guest }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
