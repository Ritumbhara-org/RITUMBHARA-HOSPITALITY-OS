import { syncBookings } from './sync';

async function testSync() {
  console.log('Initiating test sync...');
  const result = await syncBookings();
  
  if (result.success) {
    console.log(`Test Sync Success! New: ${result.newCount}, Updated: ${result.updateCount}`);
  } else {
    console.log(`Test Sync Failed: ${result.error}`);
  }
}

testSync();
