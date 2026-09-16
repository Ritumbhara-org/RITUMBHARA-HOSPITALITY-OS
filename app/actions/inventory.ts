"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createTicket } from "./operations";

export async function getInventoryItems(propertyId: string) {
  return prisma.inventoryItem.findMany({
    where: { propertyId },
    orderBy: { category: 'asc' }
  });
}

export async function addInventoryItem(data: {
  propertyId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minThreshold: number;
}) {
  const item = await prisma.inventoryItem.create({
    data
  });
  revalidatePath('/inventory');
  return item;
}

export async function updateInventoryQuantity(itemId: string, change: number, reporterId: string) {
  // 1. Fetch current item
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item not found");

  // 2. Update stock
  const newQuantity = Math.max(0, item.quantity + change);
  const updatedItem = await prisma.inventoryItem.update({
    where: { id: itemId },
    data: { quantity: newQuantity }
  });

  // 3. Automation: If stock dropped below threshold, instantly create an INVENTORY ticket!
  if (newQuantity < item.minThreshold && item.quantity >= item.minThreshold) {
    // It just crossed the threshold!
    const description = `LOW STOCK ALERT: ${item.name} is down to ${newQuantity} ${item.unit} (Threshold: ${item.minThreshold}). Please restock.`;
    
    // We create a ticket via the existing operations function.
    // It will automatically emit events and notify the team if assigned.
    const formData = new FormData();
    formData.append("description", description);
    formData.append("category", "INVENTORY");
    formData.append("priority", "HIGH");
    formData.append("propertyId", item.propertyId);
    formData.append("reporterType", "SYSTEM");
    formData.append("reporterId", reporterId);
    formData.append("assigneeId", "unassigned");

    await createTicket(formData);
  }

  revalidatePath('/inventory');
  return updatedItem;
}
