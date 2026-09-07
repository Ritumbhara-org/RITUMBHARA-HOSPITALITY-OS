import { intellistay } from './client';

async function testAuth() {
  console.log('Testing Intellistay Authentication...');
  const success = await intellistay.authenticate();
  
  if (success) {
    const token = await intellistay.getAccessToken();
    console.log(`Success! Token starts with: ${token?.substring(0, 20)}...`);
  } else {
    console.log('Authentication failed.');
  }
}

testAuth();
