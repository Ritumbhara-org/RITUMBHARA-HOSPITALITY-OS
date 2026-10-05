"use server";
import { prisma } from "@/lib/prisma";

export async function getLocationKnowledge(propertyId: string) {
  try {
    const knowledge = await prisma.locationKnowledge.findUnique({
      where: { propertyId },
    });
    return { success: true, data: knowledge };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateLocationKnowledge(propertyId: string, data: { sops: string; policies: string; prices: string; facts: string }) {
  try {
    const knowledge = await prisma.locationKnowledge.upsert({
      where: { propertyId },
      update: data,
      create: { propertyId, ...data },
    });
    return { success: true, data: knowledge };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
