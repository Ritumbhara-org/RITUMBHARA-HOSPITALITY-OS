# Housekeeping proof-of-work module

Housekeepers check in at a property, record live photos and a video for each area of a checklist, and submit. Admin sets up locations, staff and checklists. Attendance and the monthly bonus will be built on this proof (next steps).

Design: see the project doc `housekeeping-checklist-design`.

## Status

Built: login and access, checklists, housekeeper capture flow, admin review, guest-already-present exemptions, monthly tracker with strict bonus rule, stay reviews and admin overrides.
Not built yet: admin review and approval, daily and monthly tracker, guest-present exemptions, stay ratings and bonus.

## Where things live

| What | Path |
|---|---|
| Housekeeper app (mobile) | `/hk` (sign in at `/hk/login`) |
| Admin pages | `/hk-admin` (the OS admin sign-in at `/login`; also in the sidebar as Housekeeping) |
| Housekeeper server actions | `app/actions/hk.ts` |
| Admin server actions | `app/actions/hk-admin.ts` |
| Upload token route | `app/api/hk/upload/route.ts` |
| Rules (pure, tested) | `lib/hk/*` |
| HK session + login | `lib/hk/session.ts`, `app/actions/hk-auth.ts`; admin side uses the OS admin auth (`lib/auth/*`) |

## Setup

1. Apply the schema BEFORE deploying: run `prisma/sql/2026-11-21_housekeeping_proof_of_work.sql` in the SQL editor (or `npx prisma db push`). Only new tables and enums; nothing existing is altered. Production and preview share one database.
2. Set environment variables (Vercel project settings):
   - `BLOB_READ_WRITE_TOKEN`: create a Vercel Blob store and connect it to the project
3. Sign in to the OS as admin, open Housekeeping in the sidebar. Add locations (stand at the property and use "Use my current location"), then checklists, then housekeepers with their mobile number and PIN, and assign locations.

## How access works

- Housekeepers sign in with mobile number and a PIN set by the admin. Five wrong PINs lock the account for 15 minutes. Deactivating a housekeeper cuts them off immediately.
- Admin pages (`/hk-admin`) need the normal OS admin sign-in (proxy, layout, page and every action check it).
- `/hk` and `/api/hk` are public at the proxy only so housekeepers can reach them; each page, action and the upload route checks the HK session itself.
- Housekeepers sign in at `/hk/login` with mobile + PIN (own signed cookie `rb_hk_session`, 12 h; 5 wrong PINs lock the account 15 min; resetting a PIN or deactivating the user ends their sessions). The session key is derived from `ADMIN_SESSION_SECRET` unless `HK_SESSION_SECRET` is set. A housekeeper session cannot open any OS page, and the admin session is not an HK session.

## Proof rules

- Photos and videos come from the live camera only (no file picker). Videos are 3 to 60 seconds, compressed on the phone.
- Check-in and check-out must be inside the location's radius with a usable GPS fix.
- Proof captured before check-in, or in the future, is rejected.
- A turnover can only be submitted when every area has its required photos and video.
- Media URLs are only accepted from this app's own upload folder for that housekeeper.

## Known limits

- Media is stored as public Blob URLs with unguessable names. Moving to private Blob with an authenticated viewer is a follow-up.
- Location can be faked on a phone. It is recorded as a signal for the reviewer, not as proof.
- Uploads retry on a weak network, but there is no offline queue yet. The phone needs a connection to finish an upload.
- No PWA install prompt yet.

## Review, exemptions and bonus

- `/hk-admin/review`: submitted turnovers with every photo and video. Approve, reject (reason required) or send back for a redo (reopens it for the housekeeper).
- Guest already present: the housekeeper taps "Guest present" on a unit and gives a reason. The admin approves or rejects at `/hk-admin/exemptions`. Approved means excused for that unit and day.
- `/hk-admin/tracker?month=YYYY-MM`: per housekeeper turnover counts, reviews and the bonus result. Rule (`lib/hk/bonus.ts`, tested): any rejected turnover, or any review below 5 stars, fails the whole month; stays with no review do not count against them; unreviewed turnovers keep the month pending. Admin enters guest review scores by hand; an override needs a reason and is shown on the tracker. A warning shows checkouts (from reservations) with no turnover or exemption logged. It does not fail the bonus by itself.
- Not built yet: offline upload queue, private media storage, automatic import of Airbnb review scores.
