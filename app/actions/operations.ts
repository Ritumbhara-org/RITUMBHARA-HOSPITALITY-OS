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
    let defaultProperty = await prisma.property.findFirst()
    if (!defaultProperty) {
      defaultProperty = await prisma.property.create({
        data: { name: "Default Property", slug: "default", address: "System Generated", city: "System", state: "SYS", country: "SYS", phone: "000", email: "sys@sys.com", timezone: "UTC" }
      })
    }

    let defaultTeamMember = await prisma.teamMember.findFirst()
    if (!defaultTeamMember) {
      defaultTeamMember = await prisma.teamMember.create({
        data: { name: "Admin User", department: "MANAGEMENT", role: "MANAGER", phone: "0000000000", whatsappNumber: "0000000000", propertyId: defaultProperty.id }
      })
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
    revalidatePath("/dashboard")
    revalidatePath("/")
    return { success: true, ticket }
  } catch (error: any) {
    console.error("Failed to create ticket:", error)
    return { success: false, error: error.message }
  }
}
