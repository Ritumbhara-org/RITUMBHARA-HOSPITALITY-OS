import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const locations = [
  {
    name: 'Wonder Megacity Alwar',
    slug: 'wonder-megacity-alwar',
    address: 'Wonder Megacity',
    city: 'Alwar',
    state: 'Rajasthan',
    country: 'India',
    phone: '+918306312778',
    email: 'info@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    rooms: [
      { name: 'Studio 502', type: 'Studio', floor: '5', capacity: 2 },
      { name: 'Studio 603', type: 'Studio', floor: '6', capacity: 2 },
      { name: 'Studio 808', type: 'Studio', floor: '8', capacity: 2 },
      { name: 'Studio 807', type: 'Studio', floor: '8', capacity: 2 },
      { name: 'Penthouse 813', type: 'Penthouse', floor: '8', capacity: 4 }
    ]
  },
  {
    name: 'Ashadeep Jagatpura',
    slug: 'ashadeep-jagatpura',
    address: 'Ashadeep Green Avenue',
    city: 'Jaipur',
    state: 'Rajasthan',
    country: 'India',
    phone: '+918306312778',
    email: 'info@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    rooms: [
      { name: 'Studio 1211', type: 'Studio', floor: '12', capacity: 2 },
      { name: 'Studio 1212', type: 'Studio', floor: '12', capacity: 2 },
      { name: 'Studio 711', type: 'Studio', floor: '7', capacity: 2 },
      { name: 'Studio 615', type: 'Studio', floor: '6', capacity: 2 },
      { name: 'Studio 212', type: 'Studio', floor: '2', capacity: 2 },
      { name: 'Studio 1210', type: 'Studio', floor: '12', capacity: 2 },
      { name: 'Studio 909', type: 'Studio', floor: '9', capacity: 2 },
      { name: 'Studio 616', type: 'Studio', floor: '6', capacity: 2 },
      { name: 'Studio 1213', type: 'Studio', floor: '12', capacity: 2 }
    ]
  },
  {
    name: 'Urban Jagatpura',
    slug: 'urban-jagatpura',
    address: 'Urban Suites',
    city: 'Jaipur',
    state: 'Rajasthan',
    country: 'India',
    phone: '+918306312778',
    email: 'info@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    rooms: [
      { name: 'Studio 925', type: 'Studio', floor: '9', capacity: 2 }
    ]
  },
  {
    name: 'MS Valley Sariska',
    slug: 'ms-valley-sariska',
    address: 'MS Valley',
    city: 'Sariska',
    state: 'Rajasthan',
    country: 'India',
    phone: '+918306312778',
    email: 'info@ritumbhara.com',
    timezone: 'Asia/Kolkata',
    rooms: [
      { name: 'Villa 65', type: 'Villa', floor: 'G', capacity: 4 }
    ]
  }
];

async function main() {
  console.log('Seeding real locations and units...');

  for (const loc of locations) {
    // Upsert the property
    const property = await prisma.property.upsert({
      where: { slug: loc.slug },
      update: {
        name: loc.name,
        address: loc.address,
        city: loc.city,
        state: loc.state
      },
      create: {
        name: loc.name,
        slug: loc.slug,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        phone: loc.phone,
        email: loc.email,
        timezone: loc.timezone
      }
    });

    console.log(`✓ Property: ${property.name}`);

    // Upsert the units
    for (const room of loc.rooms) {
      // Find existing unit by propertyId + name to avoid duplicates
      const existingUnit = await prisma.unit.findFirst({
        where: {
          propertyId: property.id,
          name: room.name
        }
      });

      if (existingUnit) {
         await prisma.unit.update({
           where: { id: existingUnit.id },
           data: {
             type: room.type,
             floor: room.floor,
             capacity: room.capacity
           }
         });
         console.log(`  ~ Updated Unit: ${room.name}`);
      } else {
         await prisma.unit.create({
           data: {
             propertyId: property.id,
             name: room.name,
             type: room.type,
             floor: room.floor,
             capacity: room.capacity
           }
         });
         console.log(`  + Created Unit: ${room.name}`);
      }
    }
  }

  console.log('Location seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
