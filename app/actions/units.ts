"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createUnit(formData: FormData) {
  try {
    const name = formData.get("name") as string
    const type = formData.get("type") as string
    const floor = formData.get("floor") as string
    const capacityStr = formData.get("capacity") as string
    const propertyId = formData.get("propertyId") as string
    
    if (!name || !type || !propertyId) {
      throw new Error("Location, Name and Type are required fields.")
    }

    const unit = await prisma.unit.create({
      data: {
        name,
        type,
        floor: floor || "1",
        capacity: parseInt(capacityStr) || 2,
        status: "AVAILABLE",
        propertyId
      }
    })

    revalidatePath("/units")
    revalidatePath("/reservations")
    return { success: true, unit }
  } catch (error: any) {
    console.error("Failed to create unit:", error)
    return { success: false, error: error.message }
  }
}
