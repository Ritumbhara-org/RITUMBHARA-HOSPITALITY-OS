import { intellistay } from './client';

async function fetchSample() {
  console.log('Authenticating...');
  await intellistay.authenticate();
  
  console.log('Fetching bookings...');
  const response = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
    method: 'POST',
    body: JSON.stringify({ pageNumber: 1, pageSize: 2 })
  });
  
  if (!response.ok) {
    console.error('Fetch failed:', response.status, await response.text());
    return;
  }
  
  const data = await response.json();
  console.log('Payload Type:', typeof data);
  if (Array.isArray(data)) {
    console.log('Array length:', data.length);
    console.log('Sample 1:', JSON.stringify(data[0], null, 2));
  } else {
    console.log('Object keys:', Object.keys(data));
    const items = data.items || data.data;
    if (items && Array.isArray(items)) {
      console.log('Found array of length:', items.length);
      console.log('Sample 1:', JSON.stringify(items[0], null, 2));
    } else {
      console.log('Raw data:', JSON.stringify(data, null, 2));
    }
  }
}

fetchSample();
