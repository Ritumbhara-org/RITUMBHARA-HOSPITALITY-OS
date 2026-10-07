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
         'team_new_task': 'HX296f715310efc62083dd0097f2160262',
         'ticket_resolved': 'HX9e85027792f241d7b708fffc4d90d8a3',
         'ticket_resolved_custom': 'HX79696fdb9b4bcecb7bb8f388e9a0d9c9',
         'day_of_arrival_reminder': 'HX33ddb272d96520d4731d7f5ba72a3ac8',
         'post_stay_thank_you': 'HX9beb28c25fde329a33b3ca227e5bb61a',
         'ticket_assigned': 'HXa9c1cda62b0c2f9e6763e2c0df027133',
         'pre_arrival_instructions': 'HXc53995bd6a9f7fd3323fa409d57a9e67',
         'checkout_instructions': 'HX6972f5c3804258c5ddb58dd11d299d21',
         'sla_breach_alert': 'HX65186e10f421d8084b22951e7bc23692',
         'booking_confirmation': 'HX1218dec0f31aefbd7a0e122486ffed40',
         'points_redemption_alert': 'HX3d80b33321468c4479577a1df798fae9'
      };

      let createParams: any = {
        to: formattedTo
      };

      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (messageType === 'template' && templateName && contentSidMap[templateName]) {
        createParams.contentSid = contentSidMap[templateName];
        if (templateVariables) {
          createParams.contentVariables = JSON.stringify(templateVariables);
        }
        
        createParams.from = formattedFrom;
      } else {
        createParams.from = formattedFrom;
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
