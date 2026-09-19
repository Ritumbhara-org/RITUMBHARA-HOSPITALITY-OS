import { PrismaClient } from '@prisma/client';
import { normalizePhoneNumber } from '../lib/utils/phone';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting phone normalization...');

  const guests = await prisma.guest.findMany();
  for (const guest of guests) {
    const normalized = normalizePhoneNumber(guest.phone);
    if (normalized && normalized !== guest.phone) {
      await prisma.guest.update({
        where: { id: guest.id },
        data: { phone: normalized }
      });
      console.log(`Normalized Guest ${guest.name}: ${guest.phone} -> ${normalized}`);
    }
  }

  const teamMembers = await prisma.teamMember.findMany();
  for (const team of teamMembers) {
    const normalizedPhone = normalizePhoneNumber(team.phone);
    const normalizedWhatsapp = normalizePhoneNumber(team.whatsappNumber);
    
    if ((normalizedPhone && normalizedPhone !== team.phone) || (normalizedWhatsapp && normalizedWhatsapp !== team.whatsappNumber)) {
      await prisma.teamMember.update({
        where: { id: team.id },
        data: {
          phone: normalizedPhone || team.phone,
          whatsappNumber: normalizedWhatsapp || team.whatsappNumber
        }
      });
      console.log(`Normalized Team ${team.name}: ${team.phone} -> ${normalizedPhone}, ${team.whatsappNumber} -> ${normalizedWhatsapp}`);
    }
  }

  console.log('Normalization complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
