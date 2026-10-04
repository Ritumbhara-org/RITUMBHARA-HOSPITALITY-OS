import { IntellistayClient } from './lib/intellistay/client';

async function testCredentials(username, password) {
  console.log(`\nTesting username: ${username}, password: ${password}`);
  process.env.INTELLISTAY_API_URL = "https://ritumbhara.intellistay.in";
  process.env.INTELLISTAY_USERNAME = username;
  process.env.INTELLISTAY_PASSWORD = password;

  // We need to bypass the singleton instance or force re-initialization since it caches credentials
  const client = (IntellistayClient as any).instance = null;
  const newClient = IntellistayClient.getInstance();
  
  const authSuccess = await newClient.authenticate();
  if (!authSuccess) {
    console.error(`=> FAILED for ${username}`);
    return false;
  }
  
  console.log(`=> SUCCESS for ${username}!`);
  
  try {
    const response = await newClient.fetch('/api/Booking/GetAllBookingsByPagination', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "pageNumber": 1,
        "pageSize": 2
      })
    });

    const data = await response.json();
    console.log(`Successfully fetched ${data.data?.length || 0} bookings (Total count: ${data.totalCount || 'unknown'})`);
    console.log(JSON.stringify(data.data?.[0], null, 2));
    return true;
  } catch (error) {
    console.error("Failed to fetch bookings:", error);
    return false;
  }
}

async function runTests() {
  await testCredentials("PMS", "1234");
  await testCredentials("PMS", "password");
  await testCredentials("hms", "1234");
}

runTests();
