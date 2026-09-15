import { sendWhatsAppMessage } from "./client";

async function runTest() {
  console.log("Initiating Twilio WhatsApp Test...");

  const testPhone = "+918260057716"; // User's verified phone number
  
  const result = await sendWhatsAppMessage(
    testPhone,
    "text",
    "Your appointment is coming up on July 21 at 3PM",
    undefined,
    "Test",
    "test_twilio_123"
  );

  console.log("Twilio Test Result:", result);
}

runTest().catch(console.error);
