import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const CreateTicketSchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
  reporterId: z.string().min(1, "Reporter ID is required"),
  reporterType: z.enum(["GUEST", "TEAM", "MANAGEMENT"]),
  category: z.enum(["MAINTENANCE", "HOUSEKEEPING", "GUEST_REQUEST", "GUEST_COMPLAINT", "INVENTORY", "IT_SYSTEM", "PROPERTY", "SAFETY", "OTHER"]),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  description: z.string().min(1, "Description is required"),
  unitId: z.string().optional().nullable(),
  guestId: z.string().optional().nullable(),
  subcategory: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
})

// GET /api/tickets — list tickets
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get("propertyId")
    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const category = searchParams.get("category")
    const limit = parseInt(searchParams.get("limit") || "50")
    const page = parseInt(searchParams.get("page") || "1")

    const where: any = {}
    if (propertyId) where.propertyId = propertyId
    if (status) where.status = status
    if (priority) where.priority = priority
    if (category) where.category = category

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          unit: { select: { id: true, name: true } },
          guest: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.ticket.count({ where })
    ])

    return NextResponse.json({ success: true, data: tickets, meta: { total, page, limit } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/tickets — create a ticket
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateTicketSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Auto-calculate SLA deadline based on priority
    const slaDeadline = new Date()
    switch (parsed.data.priority) {
      case "CRITICAL": slaDeadline.setHours(slaDeadline.getHours() + 1); break
      case "HIGH":     slaDeadline.setHours(slaDeadline.getHours() + 4); break
      case "MEDIUM":   slaDeadline.setHours(slaDeadline.getHours() + 24); break
      case "LOW":      slaDeadline.setHours(slaDeadline.getHours() + 72); break
    }

    const ticket = await prisma.ticket.create({
      data: { ...parsed.data, slaDeadline },
      include: {
        unit: { select: { name: true } },
        assignedTo: { select: { name: true } },
      }
    })

    return NextResponse.json({ success: true, data: ticket }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
