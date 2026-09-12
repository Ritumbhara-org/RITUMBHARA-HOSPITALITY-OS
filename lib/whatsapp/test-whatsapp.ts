import { sendWhatsAppMessage } from "./client";

async function runTest() {
  console.log("Initiating WhatsApp Sandbox Test...");

  const testPhone = "+1234567890"; // Replace with actual test number if using real API
  
  const result = await sendWhatsAppMessage(
    testPhone,
    "text",
    "Hello from Ritumbhara Hospitality OS! This is a test message.",
    undefined,
    "Test",
    "test_id_123"
  );

  console.log("WhatsApp Test Result:", result);
}

runTest().catch(console.error);
