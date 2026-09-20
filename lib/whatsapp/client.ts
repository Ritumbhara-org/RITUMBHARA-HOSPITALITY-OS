import { prisma } from "@/lib/prisma";
import twilio from "twilio";
import { normalizePhoneNumber } from "@/lib/utils/phone";

export async function sendWhatsAppMessage(
  toPhone: string,
  messageType: 'template' | 'text',
  content: string,
  templateName?: string,
  relatedEntityType?: string,
  relatedEntityId?: string,
  templateVariables?: Record<string, string>
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

      const cleanToPhone = normalizePhoneNumber(toPhone);
      const cleanFromPhone = normalizePhoneNumber(fromNumber);
      
      const formattedTo = `whatsapp:${cleanToPhone}`;
      const formattedFrom = `whatsapp:${cleanFromPhone}`;

      // Mapping of your Template Names to Twilio Content API SIDs
      const contentSidMap: Record<string, string> = {
         'check_in_welcome': 'HX1b87a07d01ab079c329395cbaa039ee1',
         // TODO: Add other SIDs here as you create them in Twilio!
         // 'booking_confirmation': 'HX...',
      };

      let createParams: any = {
        from: formattedFrom,
        to: formattedTo
      };

      if (messageType === 'template' && templateName && contentSidMap[templateName]) {
        createParams.contentSid = contentSidMap[templateName];
        if (templateVariables) {
          createParams.contentVariables = JSON.stringify(templateVariables);
        }
      } else {
        createParams.body = content || `Template: ${templateName}`;
      }

      const message = await client.messages.create(createParams);

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
