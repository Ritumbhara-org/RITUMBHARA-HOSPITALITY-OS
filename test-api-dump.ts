import { IntellistayClient } from './lib/intellistay/client';

async function testApi(url: string, username: string, password: string) {
  process.env.INTELLISTAY_API_URL = url;
  process.env.INTELLISTAY_USERNAME = username;
  process.env.INTELLISTAY_PASSWORD = password;

  const client = (IntellistayClient as any).instance = null;
  const newClient = IntellistayClient.getInstance();
  
  await newClient.authenticate();
  
  const response = await newClient.fetch('/api/Booking/GetAllBookingsByPagination', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ "pageNumber": 1, "pageSize": 1 })
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testApi("https://ritumbhara.intellistay.in", "Shivam", "1234");
