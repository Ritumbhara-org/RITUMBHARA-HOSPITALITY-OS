import { config } from 'dotenv';
import twilio from 'twilio';

config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const toNumber = "+918260057716"; // Debi's number from screenshot

async function testTwilio() {
  console.log("Testing Twilio with SID:", accountSid);
  console.log("From:", fromNumber);
  
  if (!accountSid || !authToken || !fromNumber) {
    console.error("Missing credentials in .env");
    return;
  }

  const client = twilio(accountSid, authToken);
  
  try {
    const message = await client.messages.create({
      body: "Hello! This is a test message from Ritumbhara OS.",
      from: `whatsapp:${fromNumber.replace('whatsapp:', '')}`,
      to: `whatsapp:${toNumber}`
    });
    console.log("Success! Message SID:", message.sid);
  } catch (error) {
    console.error("Twilio Error:", error);
  }
}

testTwilio();
