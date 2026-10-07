import "dotenv/config";
import { sendWhatsAppMessage } from "../../lib/whatsapp/client";

async function run() {
  const toPhone = "+919503002629"; // Salim
  const templateName = "ticket_assigned";
  
  const content = `NEW TICKET
Location: Studio 603
Issue: Ok can you tell me cooker is available in kiten? We have small baby so so please convey me
Priority: MEDIUM

Reply ACCEPT to acknowledge.`;

  const variables = {
    "1": "Studio 603",
    "2": "Ok can you tell me cooker is available in kiten? We have small baby so so please convey me",
    "3": "MEDIUM"
  };

  console.log("Sending template...");
  await sendWhatsAppMessage(
    toPhone,
    "template",
    content,
    templateName,
    "Test",
    "Test-123",
    variables
  );
  console.log("Sent successfully! Check Twilio Console.");
}

run().catch(console.error);
