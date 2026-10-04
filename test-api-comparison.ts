import { IntellistayClient } from './lib/intellistay/client';

async function testApi(url: string, username: string, password: string) {
  console.log(`\n======================================`);
  console.log(`Testing URL: ${url}`);
  console.log(`Username: ${username}, Password: ${password}`);
  console.log(`======================================`);
  
  process.env.INTELLISTAY_API_URL = url;
  process.env.INTELLISTAY_USERNAME = username;
  process.env.INTELLISTAY_PASSWORD = password;

  const client = (IntellistayClient as any).instance = null;
  const newClient = IntellistayClient.getInstance();
  
  const authSuccess = await newClient.authenticate();
  if (!authSuccess) {
    console.error(`❌ Authentication FAILED for ${url}`);
    return;
  }
  
  console.log(`✅ Authentication SUCCESS! Fetching bookings...`);
  
  try {
    const response = await newClient.fetch('/api/Booking/GetAllBookingsByPagination', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "pageNumber": 1,
        "pageSize": 1 // just fetch 1 to prove it works
      })
    });

    const data = await response.json();
    console.log(`✅ Successfully fetched bookings! (Total count: ${data.totalCount || 'unknown'})`);
    console.log(`First booking customer name: ${data.data?.[0]?.customerName || 'None'}`);
  } catch (error) {
    console.error("❌ Failed to fetch bookings:", error);
  }
}

async function runTests() {
  // Test 1: Production URL with test credentials (what user asked)
  await testApi("https://ritumbhara.intellistay.in", "hms", "1234");
  
  // Test 2: Sandbox URL with test credentials (should work)
  await testApi("https://ritumbharatest.aastratech.com", "hms", "1234");
}

runTests();
