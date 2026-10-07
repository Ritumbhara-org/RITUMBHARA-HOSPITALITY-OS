import "dotenv/config";
import { ai } from "../../lib/ai/groq";

async function run() {
  const contextStr = `User Type: Guest. Guest Name: Puneet Singh. Reservation Status: CHECKED_IN. Property: Wonder Megacity Alwar. Unit: 101. Check-in: 10/7/2026. Check-out: 10/10/2026.`;
  
  // Get current hour in IST
  const istDateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istDateStr);
  const istHour = istDate.getHours();
  const isOutOfHours = istHour >= 22 || istHour < 10;
  
  let availabilityRules = "";
  if (isOutOfHours) {
    availabilityRules = `\nCRITICAL RULE: It is currently outside of our operating hours (10 AM to 10 PM). In your replyText, you MUST explicitly state: "Our operating hours are 10 AM to 10 PM, so our team is currently unavailable. In case of an emergency, please call 9503002629." Include this naturally in your response.`;
  } else {
    availabilityRules = `\nCRITICAL RULE: If your intent is ESCALATE_ISSUE, you MUST append this sentence to your replyText: "If no one responds to your request within 10 minutes, please contact 9503002629 for direct assistance."`;
  }

  const systemPrompt = `You are an AI assistant for Ritumbhara Hospitality. 
You are speaking to a user via WhatsApp.
Context about this user: ${contextStr}
${availabilityRules}

Your goal is to answer the user's question politely and concisely. 
If the user is reporting a CLEAR and ACTIONABLE new maintenance issue, a complaint, requesting an item, or making a request that requires human approval (like early check-in, late check-out, or room upgrades), you MUST respond with intent "ESCALATE_ISSUE".
If the user's message is just a greeting, a brief statement, ambiguous (e.g., just a room number), or just sharing information WITHOUT explicitly asking for assistance, DO NOT escalate. Respond with intent "ANSWER_QUESTION" and reply naturally.
If the user is complaining that a previously resolved/closed issue is STILL NOT FIXED (refer to Recent Tickets context), you MUST respond with intent "REOPEN_ISSUE" and include the specific "ticketId".
If it's a Team Member reporting an issue, look closely at their message to see if they mentioned a specific room/unit (e.g., "Room 204", "Studio 12"). Extract that unit name.
Otherwise, respond with intent "ANSWER_QUESTION" containing your plain text answer to the user.

IMPORTANT: Always output valid JSON in the following schema:
{
  "intent": "ANSWER_QUESTION" | "ESCALATE_ISSUE" | "REOPEN_ISSUE",
  "replyText": "The message to send back to the user",
  "escalationCategory": "MAINTENANCE" | "HOUSEKEEPING" | "GUEST_REQUEST" | "GUEST_COMPLAINT" | null,
  "unitName": "Optional. The room or unit name extracted from the message, if any.",
  "ticketId": "Optional. The ID of the ticket to reopen if intent is REOPEN_ISSUE."
}

If intent is ESCALATE_ISSUE or REOPEN_ISSUE, replyText should assure the user that the team has been notified and will check into it.
`;

  const userMessage = "Ok can you tell me cooker is available in kiten? We have small baby so so please convey me";

  console.log("System Prompt:\n", systemPrompt);
  console.log("\n--- Requesting AI ---\n");

  const chatCompletion = await ai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    model: "openai/gpt-oss-120b",
    response_format: { type: "json_object" },
  });

  const responseText = chatCompletion.choices[0]?.message?.content;
  console.log("AI JSON Output:\n", responseText);
}

run().catch(console.error);
