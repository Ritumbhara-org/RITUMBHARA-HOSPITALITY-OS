import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const properties = await prisma.property.findMany();
  console.log(`Found ${properties.length} properties.`);

  for (const property of properties) {
    let url = 'https://maps.app.goo.gl'; // Default
    if (property.name.toLowerCase().includes('jaipur')) {
      url = 'https://www.google.com/maps/search/?api=1&query=Urban+Suites+by+BluSalzz+Jaipur';
    } else if (property.name.toLowerCase().includes('alwar') || property.name.toLowerCase().includes('sariska')) {
      url = 'https://www.google.com/maps/search/?api=1&query=Ritumbhara+Hotel+&+Resort,+Alwar';
    } else if (property.name.toLowerCase().includes('ritumbhara')) {
      url = 'https://www.google.com/maps/search/?api=1&query=Ritumbhara+Hotel+&+Resort,+Alwar';
    }

    await prisma.property.update({
      where: { id: property.id },
      data: { googleMapsUrl: url },
    });
    console.log(`Updated ${property.name} with URL: ${url}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
