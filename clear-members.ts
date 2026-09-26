import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.membership.deleteMany();
  console.log('Deleted memberships');
}
main().catch(e => console.error(e)).finally(async () => {
  await prisma.$disconnect();
});
