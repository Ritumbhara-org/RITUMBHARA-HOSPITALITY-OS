import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const CreateTeamMemberSchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  whatsappNumber: z.string().min(1, "WhatsApp number is required"),
  role: z.string().min(1, "Role is required"),
  department: z.string().min(1, "Department is required"),
  isActive: z.boolean().default(true),
})

// GET /api/team — list team members
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get("propertyId")
    const isActive = searchParams.get("isActive")

    const where: any = {}
    if (propertyId) where.propertyId = propertyId
    if (isActive !== null) where.isActive = isActive === "true"

    const team = await prisma.teamMember.findMany({
      where,
      include: {
        _count: { select: { assignedTickets: true, housekeepingTasks: true } }
      },
      orderBy: { name: "asc" }
    })

    return NextResponse.json({ success: true, data: team, meta: { total: team.length } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/team — create a team member
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateTeamMemberSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const member = await prisma.teamMember.create({ data: parsed.data })

    return NextResponse.json({ success: true, data: member }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
