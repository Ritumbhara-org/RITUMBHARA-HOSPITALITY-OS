"use server";

import { prisma } from "@/lib/prisma";
import { withAction } from "@/lib/api-response";
import { UnitUpdateSchema, UnitUpdateInput } from "@/lib/validations";
import { revalidatePath } from "next/cache";

export async function getUnits() {
  return withAction(async () => {
    return prisma.unit.findMany({
      include: {
        property: true,
      },
      orderBy: { number: "asc" },
    });
  }, "getUnits");
}

export async function updateUnitStatus(id: string, input: UnitUpdateInput) {
  return withAction(async () => {
    const data = UnitUpdateSchema.parse(input);
    const unit = await prisma.unit.update({
      where: { id },
      data: { status: data.status },
    });
    revalidatePath("/units");
    return unit;
  }, "updateUnitStatus");
}
