-- Adds Instagram Direct Messages as an Inbox channel. Same result as `npx prisma db push` for this change.
-- Safe to run once in the Supabase/Postgres SQL editor. Run it before (or right after) deploying the code;
-- until it runs, Instagram messages can't be stored (the webhook logs store_failed and they are dropped).

ALTER TYPE "InboxChannel" ADD VALUE IF NOT EXISTS 'INSTAGRAM' BEFORE 'EMAIL';
