"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createTeamMember(data: {
  name: string;
  phone: string;
  whatsappNumber: string;
  role: string;
  department: string;
  isActive: boolean;
}) {
  try {
    // For V1, we auto-assign to the first property found
    const property = await prisma.property.findFirst();
    if (!property) {
      throw new Error("No property exists in the system yet. Please create a property first.");
    }

    const teamMember = await prisma.teamMember.create({
      data: {
        ...data,
        propertyId: property.id,
      },
    });

    revalidatePath("/team");
    return { success: true, teamMember };
  } catch (error: any) {
    console.error("[Team Action Error - Create]", error);
    return { success: false, error: error.message || "Failed to create team member." };
  }
}

export async function updateTeamMember(
  id: string,
  data: {
    name: string;
    phone: string;
    whatsappNumber: string;
    role: string;
    department: string;
    isActive: boolean;
  }
) {
  try {
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

    revalidatePath("/dashboard/team");
    return { success: true };
  } catch (error: any) {
    console.error("[Team Action Error - Delete]", error);
    return { success: false, error: error.message || "Failed to delete team member." };
  }
}
