import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const syncedRooms = await prisma.unit.findMany({
      where: { type: 'SYNCED_ROOM' }
    });

    if (syncedRooms.length === 0) {
      return NextResponse.json({ message: "No SYNCED_ROOM units found." });
    }

    const results = [];

    for (const badUnit of syncedRooms) {
      // Find the correct unit with the same name
      const goodUnit = await prisma.unit.findFirst({
        where: { 
          name: badUnit.name,
          type: { not: 'SYNCED_ROOM' }
        }
      });

      if (!goodUnit) {
        results.push({ unit: badUnit.name, error: "No correct unit found to merge into." });
        continue;
      }

      // 1. Reassign Reservations
      const resUpdate = await prisma.reservation.updateMany({
        where: { unitId: badUnit.id },
        data: { unitId: goodUnit.id }
      });

      // 2. Reassign Housekeeping Tasks
      const hkUpdate = await prisma.housekeepingTask.updateMany({
        where: { unitId: badUnit.id },
        data: { unitId: goodUnit.id }
      });

      // 3. Reassign Tickets
      const ticketUpdate = await prisma.ticket.updateMany({
        where: { unitId: badUnit.id },
        data: { unitId: goodUnit.id }
      });
      
      // 4. Update the good unit's status if the bad unit was DIRTY etc
      if (badUnit.status !== 'AVAILABLE') {
         await prisma.unit.update({
            where: { id: goodUnit.id },
            data: { status: badUnit.status }
         });
      }

      // 5. Delete the SYNCED_ROOM
      await prisma.unit.delete({
        where: { id: badUnit.id }
      });

      results.push({
        merged: badUnit.name,
        reservationsMoved: resUpdate.count,
        tasksMoved: hkUpdate.count,
        ticketsMoved: ticketUpdate.count,
        deletedId: badUnit.id
      });
    }

    return NextResponse.json({
      success: true,
      message: "Duplicate SYNCED_ROOMs have been merged and deleted.",
      results
    });
  } catch (error: any) {
    console.error("Merge error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
