import { sendWhatsAppMessage } from "./client";

async function runTest() {
  console.log("Initiating WhatsApp Sandbox Test...");

  const testPhone = "+918260057716"; // Replace with actual test number if using real API
  
  const result = await sendWhatsAppMessage(
    testPhone,
    "template",
    "", // Content is empty for template
    "hello_world",
    "Test",
    "test_id_123"
  );

  console.log("WhatsApp Test Result:", result);
}

runTest().catch(console.error);
