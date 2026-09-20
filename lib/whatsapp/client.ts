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
         'day_of_arrival_reminder': 'HX33ddb272d96520d4731d7f5ba72a3ac8',
         'post_stay_thank_you': 'HX9beb28c25fde329a33b3ca227e5bb61a',
         'ticket_assigned': 'HX5cd6f7785a5b635d62d6c6900635ec83',
         'check_in_welcome': 'HX1b87a07d01ab079c329395cbaa039ee1',
         'pre_arrival_instructions': 'HX967939a61898301d0779a5576369044e',
         'checkout_instructions': 'HXb320badd14f3692b48596358445e5bc4',
         'sla_breach_alert': 'HX65186e10f421d8084b22951e7bc23692',
         'booking_confirmation': 'HXf7b175747b9c791de513032c1e4cd589'
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
