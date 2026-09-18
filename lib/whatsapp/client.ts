import { prisma } from "@/lib/prisma";
import twilio from "twilio";

export async function sendWhatsAppMessage(
  toPhone: string,
  messageType: 'template' | 'text',
  content: string,
  templateName?: string,
  relatedEntityType?: string,
  relatedEntityId?: string
) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  let deliveryStatus = 'PENDING';

  try {
    if (!accountSid || !authToken || !fromNumber) {
      console.log(`[WhatsApp Sandbox Fallback] Missing Twilio credentials. Mock sending to ${toPhone}: ${content}`);
      deliveryStatus = 'SANDBOX_DELIVERED';
    } else {
      const client = twilio(accountSid, authToken);

      // Clean non-numeric characters
      let numericToPhone = toPhone.replace(/\D/g, '');
      let numericFromPhone = fromNumber.replace(/\D/g, '');

      // Assume Indian country code (+91) if it's exactly 10 digits
      if (numericToPhone.length === 10) {
        numericToPhone = '91' + numericToPhone;
      }
      if (numericFromPhone.length === 10) {
        numericFromPhone = '91' + numericFromPhone;
      }

      const cleanToPhone = '+' + numericToPhone;
      const cleanFromPhone = '+' + numericFromPhone;
      
      const formattedTo = `whatsapp:${cleanToPhone}`;
      const formattedFrom = `whatsapp:${cleanFromPhone}`;

      const messageBody = content || `Template: ${templateName}`;

      const message = await client.messages.create({
        body: messageBody,
        from: formattedFrom,
        to: formattedTo
      });

      console.log(`[Twilio Success] Message sent to ${formattedTo}. SID: ${message.sid}`);
      deliveryStatus = 'DELIVERED';
    }
  } catch (error: any) {
    console.error('[WhatsApp Client Error]', error.message);
    deliveryStatus = 'FAILED';
  }

  // Log to database
  try {
    await prisma.whatsAppMessage.create({
      data: {
        direction: 'OUTBOUND',
        from: fromNumber || 'SYSTEM',
        to: toPhone,
        messageType,
        content,
        templateName,
        status: deliveryStatus,
        relatedEntityType,
        relatedEntityId
      }
    });
  } catch (dbError) {
    console.error('[WhatsApp DB Logging Error]', dbError);
  }

  return { success: deliveryStatus !== 'FAILED', status: deliveryStatus };
}
