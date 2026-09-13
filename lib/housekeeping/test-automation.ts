import { eventBus } from "@/lib/events/bus";
import { prisma } from "@/lib/prisma";

async function runTest() {
  console.log("Initiating Housekeeping Automation Test...");

  // 1. Setup mock data
  const property = await prisma.property.findFirst();
  if (!property) throw new Error("No property found.");

  let unit = await prisma.unit.findFirst({ where: { status: 'OCCUPIED' } });
  if (!unit) {
    unit = await prisma.unit.findFirst();
    if (!unit) throw new Error("No unit found.");
    await prisma.unit.update({ where: { id: unit.id }, data: { status: 'OCCUPIED' } });
  }

  const guest = await prisma.guest.findFirst();
  if (!guest) throw new Error("No guest found.");

  let reservation = await prisma.reservation.findFirst({
    where: { unitId: unit.id, status: 'CHECKED_IN' }
  });

  if (!reservation) {
    reservation = await prisma.reservation.create({
      data: {
        guestId: guest.id,
        unitId: unit.id,
        propertyId: property.id,
        checkIn: new Date(),
        checkOut: new Date(Date.now() + 86400000),
        status: 'CHECKED_IN',
        source: 'TEST',
        totalAmount: 100
      }
    });
  }

  console.log(`[Test Setup] Unit ${unit.id} is ${unit.status}.`);
  console.log(`[Test Setup] Firing GUEST_CHECKED_OUT event for Reservation ${reservation.id}...`);

  // 2. Fire the event
  await eventBus.emit('GUEST_CHECKED_OUT', {
    reservationId: reservation.id,
    guestId: guest.id,
    propertyId: property.id,
    intellistayBookingId: 'TEST_ID',
    status: 'CHECKED_OUT',
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut
  });

  // 3. Wait for async listeners to complete
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 4. Verify results
  const updatedUnit = await prisma.unit.findUnique({ where: { id: unit.id } });
  console.log(`[Verification] Unit status is now: ${updatedUnit?.status}`);
  if (updatedUnit?.status !== 'DIRTY') {
    console.error("❌ FAILED: Unit status is not DIRTY.");
  } else {
    console.log("✅ PASSED: Unit status successfully updated to DIRTY.");
  }

  const tasks = await prisma.housekeepingTask.findMany({
    where: { unitId: unit.id, type: 'CHECKOUT_CLEAN' }
  });

  console.log(`[Verification] Found ${tasks.length} Housekeeping Tasks.`);
  if (tasks.length === 0) {
    console.error("❌ FAILED: No Housekeeping Task was created.");
  } else {
    console.log("✅ PASSED: Housekeeping Task successfully created.", tasks[0]);
  }
}

runTest().catch(console.error);
