import { intellistay } from './lib/intellistay/client';

async function testApi() {
  await intellistay.authenticate();
  const response = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
      method: 'POST',
      body: JSON.stringify({
        PageNumber: 1,
        PageSize: 10
      })
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testApi();
