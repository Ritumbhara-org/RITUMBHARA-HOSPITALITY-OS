import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VALID_SLUGS = [
  'wonder-megacity-alwar',
  'ashadeep-jagatpura',
  'urban-jagatpura',
  'ms-valley-sariska'
];

async function main() {
  console.log('Starting cleanup of old properties...');

  const propertiesToDelete = await prisma.property.findMany({
    where: {
      slug: {
        notIn: VALID_SLUGS
      }
    }
  });

  if (propertiesToDelete.length === 0) {
    console.log('No old properties found to delete.');
    return;
  }

  for (const property of propertiesToDelete) {
    console.log(`\nDeleting Property: ${property.name} (${property.slug})`);

    // Fetch all units for this property
    const units = await prisma.unit.findMany({
      where: { propertyId: property.id },
      select: { id: true }
    });
    const unitIds = units.map(u => u.id);

    // 1. Delete TicketAuditLogs for Tickets in this property
    const tickets = await prisma.ticket.findMany({
      where: { propertyId: property.id },
      select: { id: true }
    });
    const ticketIds = tickets.map(t => t.id);
    
    if (ticketIds.length > 0) {
      const deletedLogs = await prisma.ticketAuditLog.deleteMany({
        where: { ticketId: { in: ticketIds } }
      });
      console.log(` - Deleted ${deletedLogs.count} TicketAuditLogs`);
    }

    // 2. Delete Tickets
    const deletedTickets = await prisma.ticket.deleteMany({
      where: { propertyId: property.id }
    });
    console.log(` - Deleted ${deletedTickets.count} Tickets`);

    // 3. Delete HousekeepingTasks
    if (unitIds.length > 0) {
       const deletedTasks = await prisma.housekeepingTask.deleteMany({
         where: { unitId: { in: unitIds } }
       });
       console.log(` - Deleted ${deletedTasks.count} HousekeepingTasks (by unit)`);
    }

    const deletedTasksProp = await prisma.housekeepingTask.deleteMany({
      where: { propertyId: property.id }
    });
    console.log(` - Deleted ${deletedTasksProp.count} HousekeepingTasks (by property)`);

    // 4. Delete Reservations
    if (unitIds.length > 0) {
        const deletedReservationsByUnit = await prisma.reservation.deleteMany({
          where: { unitId: { in: unitIds } }
        });
        console.log(` - Deleted ${deletedReservationsByUnit.count} Reservations (by unit)`);
    }

    const deletedReservations = await prisma.reservation.deleteMany({
      where: { propertyId: property.id }
    });
    console.log(` - Deleted ${deletedReservations.count} Reservations (by property)`);

    // 5. Delete InventoryItems
    const deletedInventory = await prisma.inventoryItem.deleteMany({
      where: { propertyId: property.id }
    });
    console.log(` - Deleted ${deletedInventory.count} InventoryItems`);

    // 6. Delete TeamMembers
    const deletedTeam = await prisma.teamMember.deleteMany({
      where: { propertyId: property.id }
    });
    console.log(` - Deleted ${deletedTeam.count} TeamMembers`);

    // 7. Delete Units
    const deletedUnits = await prisma.unit.deleteMany({
      where: { propertyId: property.id }
    });
    console.log(` - Deleted ${deletedUnits.count} Units`);

    // 8. Finally, Delete the Property
    await prisma.property.delete({
      where: { id: property.id }
    });
    console.log(` ✓ Successfully deleted ${property.name}`);
  }

  console.log('\nCleanup complete! Only the valid locations remain.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
