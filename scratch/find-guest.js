const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const guests = await prisma.guest.findMany({
    where: {
      name: { contains: 'Ayush', mode: 'insensitive' }
    }
  });
  console.log(JSON.stringify(guests, null, 2));
}

main().finally(() => prisma.$disconnect());
