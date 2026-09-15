import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppAction } from "@/lib/whatsapp/action-handler";

export async function POST(req: Request) {
  try {
    // Twilio sends data as application/x-www-form-urlencoded
    const text = await req.text();
    const params = new URLSearchParams(text);

    // Extract crucial Twilio webhook fields
    const from = params.get("From"); // e.g., "whatsapp:+918260057716"
    const body = params.get("Body"); // e.g., "ACCEPT"

    if (!from || !body) {
      return NextResponse.json({ error: "Invalid Twilio payload" }, { status: 400 });
    }

    // Clean the phone number (remove "whatsapp:" prefix)
    const senderPhone = from.replace("whatsapp:", "");
    const messageText = body.trim().toUpperCase();

    console.log(`[Twilio Webhook] Received message from ${senderPhone}: ${messageText}`);

    // Process the action (ACCEPT, START, COMPLETE)
    const responseMessage = await handleWhatsAppAction(senderPhone, messageText);

    // Twilio allows us to respond directly to the webhook using TwiML (XML)
    // This perfectly bypasses any API session issues because Twilio guarantees
    // synchronous webhook replies are authorized!
    const twimlResponse = `
      <Response>
        <Message>${responseMessage}</Message>
      </Response>
    `;

    return new NextResponse(twimlResponse, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error: any) {
    console.error("[Twilio Webhook Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
