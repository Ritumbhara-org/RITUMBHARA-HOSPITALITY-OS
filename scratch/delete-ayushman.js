const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ayushmanId = 'cmu98b26y0000edfx8yllzi79';
  
  console.log('Deleting reservations for Ayushman...');
  await prisma.reservation.deleteMany({
    where: { guestId: ayushmanId }
  });

  console.log('Deleting guest Ayushman...');
  await prisma.guest.delete({
    where: { id: ayushmanId }
  });

  console.log('Successfully deleted Ayushman and their reservations.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
