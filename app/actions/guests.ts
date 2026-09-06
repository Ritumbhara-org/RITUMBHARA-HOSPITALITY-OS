"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createGuest(formData: FormData) {
  try {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const idType = formData.get("idType") as string
    const idNumber = formData.get("idNumber") as string
    const assignMembership = formData.get("assignMembership") === "true"
    
    if (!name || !phone) {
      throw new Error("Name and Phone are required fields.")
    }

    const guest = await prisma.guest.create({
      data: {
        name,
        email: email || null,
        phone,
        idType: idType || null,
        idNumber: idNumber || null,
        membership: assignMembership ? {
          create: {
            tier: "STANDARD",
            points: 0,
            joinedAt: new Date()
          }
        } : undefined
      }
    })

    revalidatePath("/guests")
    return { success: true, guest }
  } catch (error: any) {
    console.error("Failed to create guest:", error)
    return { success: false, error: error.message }
  }
}

export async function updateGuest(guestId: string, formData: FormData) {
  try {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const idType = formData.get("idType") as string
    const idNumber = formData.get("idNumber") as string
    
    if (!name || !phone) {
      throw new Error("Name and Phone are required fields.")
    }

    const guest = await prisma.guest.update({
      where: { id: guestId },
      data: {
        name,
        email: email || null,
        phone,
        idType: idType || null,
        idNumber: idNumber || null,
      }
    })

    revalidatePath("/guests")
    revalidatePath(`/guests/${guestId}`)
    return { success: true, guest }
  } catch (error: any) {
    console.error("Failed to update guest:", error)
    return { success: false, error: error.message }
  }
}

