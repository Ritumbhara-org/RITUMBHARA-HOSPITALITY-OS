-- Unified Inbox tables. Same result as `npx prisma db push` for this change.
-- Safe to run once in the Supabase/Postgres SQL editor: it only ADDS two enums and two tables.
-- Wrapped in a transaction, so nothing is applied if any statement fails.

BEGIN;

CREATE TYPE "InboxChannel" AS ENUM ('WHATSAPP', 'AIRBNB', 'BOOKING_COM', 'AGODA', 'EXPEDIA', 'EMAIL');
CREATE TYPE "InboxConversationStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "InboxConversation" (
    "id" TEXT NOT NULL,
    "channel" "InboxChannel" NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "subject" TEXT,
    "guestName" TEXT,
    "guestContact" TEXT,
    "replyTo" TEXT,
    "propertyId" TEXT,
    "reservationId" TEXT,
    "guestId" TEXT,
    "assigneeId" TEXT,
    "status" "InboxConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessagePreview" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboxConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "senderName" TEXT,
    "sentById" TEXT,
    "externalMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxConversation_channel_externalThreadId_key" ON "InboxConversation"("channel", "externalThreadId");
CREATE INDEX "InboxConversation_status_idx" ON "InboxConversation"("status");
CREATE INDEX "InboxConversation_lastMessageAt_idx" ON "InboxConversation"("lastMessageAt");
CREATE INDEX "InboxConversation_assigneeId_idx" ON "InboxConversation"("assigneeId");
CREATE INDEX "InboxConversation_reservationId_idx" ON "InboxConversation"("reservationId");
CREATE UNIQUE INDEX "InboxMessage_externalMessageId_key" ON "InboxMessage"("externalMessageId");
CREATE INDEX "InboxMessage_conversationId_createdAt_idx" ON "InboxMessage"("conversationId", "createdAt");

ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
