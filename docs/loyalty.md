# Membership & Loyalty

Star / RockStar / Super Star programme. Code: `lib/loyalty/*`, admin at `/loyalty`, member portal at `/member`.

## Rules

| Tier | Qualifies with (rolling 6 months, completed stays, excl. tax/refunds) | Multiplier |
|---|---|---|
| Star | joining / first booking | 1X |
| RockStar | ₹12,000 | 2X |
| Super Star | ₹36,000 | 4X |

- Points = FLOOR(eligible ₹ / 100 × 5 × channel × tier). Channel: OTA 1X, direct (website, WhatsApp, phone, walk-in, OS) 2X. Unknown sources count as OTA.
- Credited after check-out, at the tier the member held when the stay completed (spend from their *other* stays). Tier, channel, multipliers and the calculation are stored on the ledger row.
- Stays checked out before `LOYALTY_PROGRAM_START` (default 2026-11-01) don't earn but still count toward tiers.
- Refunds (recorded on the member profile), amount changes and cancellations post the difference. A reversal larger than the balance leaves a debt that the next points pay off.
- Bonuses: birthday 100, anniversary 100 (once per calendar year each), referral 100 + 100 after the referred member's first completed **and paid** stay. Referral codes only for members with no completed stay; one referrer per member; no self-referral.
- Every credit expires 6 calendar months after it was credited. Reminder 30 days before, message on expiry. Points held before go-live get 6 months from the migration date.
- 1 point = ₹1. Only staff can redeem, and only with the OTP sent to the member's WhatsApp (5 minutes, 3 tries, rate-limited).

## Ledger

`PointTransaction` is insert-only (database trigger refuses UPDATE/DELETE). Debits record which credit batches they used in `PointAllocation` (soonest expiry first). All writes for a member run in one transaction holding a per-member advisory lock, with an idempotency key per event (`EARN:<reservationId>`, `REDEMPTION:<id>`, `BIRTHDAY:<member>:<year>`, …). `Membership.points` is only a cache.

One membership per normalized mobile number, so guest records from different OTAs with the same number share it.

## Setup

1. Run `prisma/sql/2026-11-01_membership_loyalty.sql` in the Supabase SQL editor (safe to re-run), then deploy.
2. `vercel.json` schedules `GET /api/cron/loyalty` daily at 09:05 IST (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically). It enrols guests, credits/reverses stays (safety net for the event listeners), awards birthday/anniversary bonuses, expires points, sends reminders, re-evaluates tiers and retries failed WhatsApp messages.
3. Environment variables (none are required beyond what the OS already has):
   - `LOYALTY_PROGRAM_START` — `YYYY-MM-DD`, first check-out date that earns.
   - `LOYALTY_WA_TEMPLATES` — Twilio Content SIDs, JSON: `{"POINTS_CREDITED":"HX…","BIRTHDAY_BONUS":"HX…","ANNIVERSARY_BONUS":"HX…","REFERRAL_BONUS":"HX…","TIER_UPGRADE":"HX…","POINTS_EXPIRING":"HX…","POINTS_EXPIRED":"HX…","OTP":"HX…","REDEMPTION_SUCCESS":"HX…"}`. Without a SID the plain text is sent (WhatsApp only delivers it inside a 24-hour window, so OTPs and reminders need approved templates).
   - Meta: approve templates named `loyalty_points_credited`, `loyalty_birthday_bonus`, `loyalty_anniversary_bonus`, `loyalty_referral_bonus`, `loyalty_tier_upgrade`, `loyalty_points_expiring`, `loyalty_points_expired`, `loyalty_otp` (authentication), `loyalty_redemption_success` (override with `META_WA_TEMPLATES`).
   - `MEMBER_SESSION_SECRET` (optional, ≥32 chars) — signs member portal cookies; falls back to a key derived from `ADMIN_SESSION_SECRET`.
   - `LOYALTY_OTP_SECRET` (optional) — OTP hashing key; falls back to `ADMIN_SESSION_SECRET`.
   - `NEXT_PUBLIC_APP_URL` — used for the member referral link.

Template variables, in order ({{1}}, {{2}}, …): see `TEMPLATES` in `lib/loyalty/notify.ts`.

## Tests

`npm test` runs the rules tests. The database tests (`tests/loyalty-db.test.ts`) need a scratch Postgres with the schema and this SQL applied: `LOYALTY_TEST_DATABASE_URL=postgresql://… npm test`. They truncate tables — never point them at a real database.
