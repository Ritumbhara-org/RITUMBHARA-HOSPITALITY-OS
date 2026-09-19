"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { normalizePhoneNumber } from "@/lib/utils/phone";

export async function createTeamMember(formData: FormData) {
  try {
    const data = {
      name: formData.get("name") as string,
      phone: normalizePhoneNumber(formData.get("phone") as string),
      whatsappNumber: normalizePhoneNumber(formData.get("whatsappNumber") as string),
      role: formData.get("role") as string,
      department: formData.get("department") as string,
      isActive: formData.get("isActive") === "true",
      propertyId: formData.get("propertyId") as string,
    }

    if (!data.propertyId) {
      throw new Error("Location/Property is required.");
    }

    const teamMember = await prisma.teamMember.create({
      data,
    });

    revalidatePath("/team");
    return { success: true, teamMember };
  } catch (error: any) {
    console.error("[Team Action Error - Create]", error);
    return { success: false, error: error.message || "Failed to create team member." };
  }
}

export async function updateTeamMember(id: string, formData: FormData) {
  try {
    const data = {
      name: formData.get("name") as string,
      phone: normalizePhoneNumber(formData.get("phone") as string),
      whatsappNumber: normalizePhoneNumber(formData.get("whatsappNumber") as string),
      role: formData.get("role") as string,
      department: formData.get("department") as string,
      isActive: formData.get("isActive") === "true",
      propertyId: formData.get("propertyId") as string,
    }

    if (!data.propertyId) {
      throw new Error("Location/Property is required.");
    }

    const teamMember = await prisma.teamMember.update({
      where: { id },
      data,
    });

    revalidatePath("/team");
    return { success: true, teamMember };
  } catch (error: any) {
    console.error("[Team Action Error - Update]", error);
    return { success: false, error: error.message || "Failed to update team member." };
  }
}

export async function deleteTeamMember(id: string) {
  try {
    await prisma.teamMember.delete({
      where: { id },
    });

    revalidatePath("/team");
    return { success: true };
  } catch (error: any) {
    console.error("[Team Action Error - Delete]", error);
    return { success: false, error: error.message || "Failed to delete team member." };
  }
}
