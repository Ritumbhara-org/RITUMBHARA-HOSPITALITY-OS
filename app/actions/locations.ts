"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createLocation(formData: FormData) {
  try {
    const name = formData.get("name") as string
    const city = formData.get("city") as string
    
    if (!name || !city) {
      throw new Error("Name and City are required")
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();

    await prisma.property.create({
      data: {
        name,
        city,
        slug,
        address: formData.get("address") as string || "",
        state: formData.get("state") as string || "",
        country: formData.get("country") as string || "India",
        phone: formData.get("phone") as string || "",
        email: formData.get("email") as string || "",
        timezone: "Asia/Kolkata"
      }
    })

    revalidatePath("/locations")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateLocation(id: string, formData: FormData) {
  try {
    const name = formData.get("name") as string
    const city = formData.get("city") as string
    
    if (!name || !city) {
      throw new Error("Name and City are required")
    }

    await prisma.property.update({
      where: { id },
      data: {
        name,
        city,
        address: formData.get("address") as string || "",
        state: formData.get("state") as string || "",
        country: formData.get("country") as string || "India",
        phone: formData.get("phone") as string || "",
        email: formData.get("email") as string || "",
      }
    })

    revalidatePath("/locations")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteLocation(id: string) {
  try {
    await prisma.property.delete({
      where: { id }
    })
    
    revalidatePath("/locations")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
