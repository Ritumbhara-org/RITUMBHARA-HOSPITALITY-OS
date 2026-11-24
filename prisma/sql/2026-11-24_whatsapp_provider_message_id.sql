-- Meta WhatsApp delivery-status webhooks: remember the provider message id (wamid) of each OUTBOUND WhatsApp message,
-- so sent / delivered / read / failed events can find the row.
-- Same result as `npx prisma db push` for this change. Purely additive: one nullable column and one index on
-- "WhatsAppMessage". Existing rows and the Twilio paths are unaffected. Safe to run more than once.
-- Run it on a database BEFORE deploying code that uses that database (the Prisma client selects every column).

BEGIN;

ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_providerMessageId_idx" ON "WhatsAppMessage"("providerMessageId");

COMMIT;

-- Rollback (only if ever needed; nothing reads the column except the Meta status webhook):
--   DROP INDEX IF EXISTS "WhatsAppMessage_providerMessageId_idx";
--   ALTER TABLE "WhatsAppMessage" DROP COLUMN IF EXISTS "providerMessageId";
