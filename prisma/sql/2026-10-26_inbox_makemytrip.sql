-- Adds MakeMyTrip / Goibibo as an Inbox channel. Same result as `npx prisma db push` for this change.
-- Safe to run once in the Supabase/Postgres SQL editor. Run it before (or right after) deploying the code;
-- until it runs, MakeMyTrip emails are refused and the Gmail bridge simply retries them on its next run.

ALTER TYPE "InboxChannel" ADD VALUE IF NOT EXISTS 'MAKEMYTRIP' BEFORE 'EMAIL';
