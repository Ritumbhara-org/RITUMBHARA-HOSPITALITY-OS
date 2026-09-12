import { prisma } from "@/lib/prisma";

export async function sendWhatsAppMessage(
  toPhone: string,
  messageType: 'template' | 'text',
  content: string,
  templateName?: string,
  relatedEntityType?: string,
  relatedEntityId?: string
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  let deliveryStatus = 'PENDING';
  let apiResponse = null;

  try {
    if (!token || !phoneNumberId) {
      console.log(`[WhatsApp Sandbox] Sending ${messageType} to ${toPhone}: ${content}`);
      deliveryStatus = 'SANDBOX_DELIVERED';
    } else {
      // Build Meta API payload
      const payload = {
        messaging_product: 'whatsapp',
        to: toPhone.replace(/\D/g, ''), // Strip non-numeric characters
        type: messageType,
        ...(messageType === 'text' && {
          text: { body: content }
        }),
        ...(messageType === 'template' && {
          template: {
            name: templateName,
            language: { code: 'en_US' }
          }
        })
      };

      const res = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      apiResponse = await res.json();
      if (!res.ok) {
        throw new Error(`Meta API Error: ${JSON.stringify(apiResponse)}`);
      }
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
        from: 'SYSTEM',
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
