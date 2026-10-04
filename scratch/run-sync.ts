import { syncBookings } from '../lib/intellistay/sync';
async function run() {
  const res = await syncBookings();
  console.log(res);
}
run();
