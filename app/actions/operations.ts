"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createTicket(formData: FormData) {
  try {
    const title = formData.get("title") as string // We'll map this to subcategory or append to description
    const description = formData.get("description") as string
    const category = formData.get("category") as string
    const priority = formData.get("priority") as string
    
    // In a real app, these would come from the auth session
    // For now, let's just grab the first property and first team member to act as the "logged in" user
    const defaultProperty = await prisma.property.findFirst()
    const defaultTeamMember = await prisma.teamMember.findFirst()

    if (!defaultProperty || !defaultTeamMember) {
      throw new Error("System not fully initialized (missing property or team member).")
    }

    const unitId = formData.get("unitId") as string

    // Combine title and description since the schema doesn't have a title field
    const fullDescription = `[${title}] ${description}`

    // Calculate SLA deadline based on priority
    const slaDeadline = new Date()
    switch(priority) {
      case 'CRITICAL': slaDeadline.setHours(slaDeadline.getHours() + 1); break;
      case 'HIGH': slaDeadline.setHours(slaDeadline.getHours() + 4); break;
      case 'MEDIUM': slaDeadline.setHours(slaDeadline.getHours() + 24); break;
      case 'LOW': slaDeadline.setHours(slaDeadline.getHours() + 72); break;
    }

    const ticket = await prisma.ticket.create({
      data: {
        description: fullDescription,
        category: category as any,
        priority: priority as any,
        propertyId: defaultProperty.id,
        reporterId: defaultTeamMember.id,
        reporterType: "TEAM",
        status: "OPEN",
        slaDeadline: slaDeadline,
        unitId: unitId === 'property' ? null : unitId
      }
    })

    revalidatePath("/operations")
    return { success: true, ticket }
  } catch (error: any) {
    console.error("Failed to create ticket:", error)
    return { success: false, error: error.message }
  }
}
