-- Phone alerts (web push): adds the PushSubscription table. Same result as `npx prisma db push` for this change.
-- Safe to run in the Supabase/Postgres SQL editor: it only ADDS one table and one unique index, and every
-- statement uses IF NOT EXISTS, so running it after `db push` (or twice) changes nothing.
-- Run it before (or right after) deploying the code; until it runs, the bell's "Turn on phone alerts" button
-- cannot save a phone and everything else works as before.

BEGIN;

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

COMMIT;
