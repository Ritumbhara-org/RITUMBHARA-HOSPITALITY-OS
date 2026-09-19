import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const locations = [
  {
    name: 'Jaipur',
    slug: 'jaipur',
    address: 'Jaipur, Rajasthan',
    city: 'Jaipur',
    state: 'RJ',
    country: 'India',
    phone: '+91-9503002629',
    email: 'jaipur@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    units: [
      { name: 'Studio 925', type: 'Studio', capacity: 2, floor: '9' },
      { name: 'Studio 711', type: 'Studio', capacity: 2, floor: '7' },
      { name: 'Studio 909', type: 'Studio', capacity: 2, floor: '9' },
      { name: 'Studio 1210', type: 'Studio', capacity: 2, floor: '12' },
      { name: 'Studio 1212', type: 'Studio', capacity: 2, floor: '12' },
    ]
  },
  {
    name: 'Agra',
    slug: 'agra',
    address: 'Agra, Uttar Pradesh',
    city: 'Agra',
    state: 'UP',
    country: 'India',
    phone: '+91-9503002629',
    email: 'agra@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    units: [] // Coming Soon
  },
  {
    name: 'Sariska',
    slug: 'sariska',
    address: 'Sariska, Rajasthan',
    city: 'Alwar',
    state: 'RJ',
    country: 'India',
    phone: '+91-9503002629',
    email: 'sariska@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    units: [
      { name: 'Villa 65 Sariska', type: 'Villa', capacity: 6, floor: 'Ground' },
    ]
  },
  {
    name: 'Alwar',
    slug: 'alwar',
    address: 'Alwar, Rajasthan',
    city: 'Alwar',
    state: 'RJ',
    country: 'India',
    phone: '+91-9503002629',
    email: 'alwar@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    units: [
      { name: 'Apartment 813', type: 'Serviced Apartment', capacity: 4, floor: '8' },
      { name: 'Studio 502 Alwar', type: 'Studio', capacity: 2, floor: '5' },
      { name: 'Studio 807 Alwar', type: 'Studio', capacity: 2, floor: '8' },
      { name: 'Studio 808 Alwar', type: 'Studio', capacity: 2, floor: '8' },
      { name: 'Studio 603 Alwar', type: 'Studio', capacity: 2, floor: '6' },
    ]
  }
];

async function main() {
  console.log('Starting seed...');

  for (const loc of locations) {
    const property = await prisma.property.upsert({
      where: { slug: loc.slug },
      update: {},
      create: {
        name: loc.name,
        slug: loc.slug,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        phone: loc.phone,
        email: loc.email,
        timezone: loc.timezone,
      },
    });

    console.log(`Created/Ensured Property: ${property.name}`);

    for (const unit of loc.units) {
      // Avoid recreating duplicate units if script runs multiple times
      const existing = await prisma.unit.findFirst({
        where: { name: unit.name, propertyId: property.id }
      });
      if (!existing) {
        await prisma.unit.create({
          data: {
            propertyId: property.id,
            name: unit.name,
            type: unit.type,
            floor: unit.floor,
            capacity: unit.capacity,
            status: 'AVAILABLE',
          }
        });
        console.log(`  -> Created Unit: ${unit.name}`);
      } else {
        console.log(`  -> Unit already exists: ${unit.name}`);
      }
    }
  }

  console.log('Seeding complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
