-- Meta delivery-status webhooks: remember the provider message id (wamid) of each outbound WhatsApp message.
-- Nullable and additive: existing rows and the Twilio paths are unaffected.
ALTER TABLE "WhatsAppMessage" ADD COLUMN "providerMessageId" TEXT;
CREATE INDEX "WhatsAppMessage_providerMessageId_idx" ON "WhatsAppMessage"("providerMessageId");
