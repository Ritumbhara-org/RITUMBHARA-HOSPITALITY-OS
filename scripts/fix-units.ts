import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixUnitStatus() {
  console.log("Fixing current unit statuses...");
  const units = await prisma.unit.findMany({
    include: {
      reservations: {
        where: {
          status: 'CHECKED_IN'
        }
      }
    }
  });

  let count = 0;
  for (const unit of units) {
    if (unit.reservations.length > 0 && unit.status !== 'OCCUPIED') {
      console.log(`Setting Unit ${unit.name} to OCCUPIED...`);
      await prisma.unit.update({
        where: { id: unit.id },
        data: { status: 'OCCUPIED' }
      });
      count++;
    }
  }

  console.log(`Updated ${count} units to OCCUPIED.`);
}

fixUnitStatus().catch(console.error).finally(() => prisma.$disconnect());
