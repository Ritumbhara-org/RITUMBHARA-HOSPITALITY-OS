import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.unit.updateMany({
    where: {
      status: 'DIRTY'
    },
    data: {
      status: 'AVAILABLE'
    }
  });
  console.log(`Successfully updated ${result.count} rooms from DIRTY to AVAILABLE.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
