import { syncBookings } from './sync';
import { prisma } from './../prisma';

async function testSync() {
  console.log('Ensuring default property exists...');
  let property = await prisma.property.findFirst();
  if (!property) {
    property = await prisma.property.create({
      data: {
        name: "Ritumbhara Headquarters",
        slug: "hq",
        address: "123 Main St",
        city: "Mumbai",
        state: "MH",
        country: "India",
        phone: "0000000000",
        email: "contact@ritumbhara.com",
        timezone: "Asia/Kolkata"
      }
    });
    console.log('Created default property:', property.id);
  }

  console.log('Initiating test sync...');
  const result = await syncBookings();
  
  if (result.success) {
    console.log(`Test Sync Success! New: ${result.newCount}, Updated: ${result.updateCount}`);
  } else {
    console.log(`Test Sync Failed: ${result.error}`);
  }
}

testSync();
