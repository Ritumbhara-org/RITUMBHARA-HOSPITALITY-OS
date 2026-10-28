-- Admin notification bell: adds the AdminNotification table. Same result as `npx prisma db push` for this change.
-- Safe to run in the Supabase/Postgres SQL editor: it only ADDS one table and two indexes, and every statement
-- uses IF NOT EXISTS, so running it after `db push` (or twice) changes nothing.
-- Run it before (or right after) deploying the code; until it runs, the bell shows a setup notice and
-- everything else works as before.

BEGIN;

CREATE TABLE IF NOT EXISTS "AdminNotification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "groupKey" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "propertyId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminNotification_readAt_createdAt_idx" ON "AdminNotification"("readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminNotification_groupKey_readAt_idx" ON "AdminNotification"("groupKey", "readAt");

COMMIT;
