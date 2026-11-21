# Housekeeping proof-of-work module

Housekeepers check in at a property, record live photos and a video for each area of a checklist, and submit. Admin sets up locations, staff and checklists. Attendance and the monthly bonus will be built on this proof (next steps).

Design: see the project doc `housekeeping-checklist-design`.

## Status

Built: steps 1 to 3 (login and access, checklists, housekeeper capture flow).
Not built yet: admin review and approval, daily and monthly tracker, guest-present exemptions, stay ratings and bonus.

## Where things live

| What | Path |
|---|---|
| Housekeeper app (mobile) | `/hk` (sign in at `/hk/login`) |
| Admin pages | `/hk-admin` (sign in at `/hk-admin/login`) |
| Housekeeper server actions | `app/actions/hk.ts` |
| Admin server actions | `app/actions/hk-admin.ts` |
| Upload token route | `app/api/hk/upload/route.ts` |
| Rules (pure, tested) | `lib/hk/*` |
| Auth config | `lib/hk/auth.ts`, `proxy.ts` |

## Setup

1. Apply the schema. The repo's migrations folder is behind the schema, so this project syncs with `prisma db push`:
   `npx prisma db push`
   All changes are new tables and enums. Nothing existing is altered.
2. Set environment variables (Vercel project settings):
   - `NEXTAUTH_SECRET`: a long random string
   - `NEXTAUTH_URL`: the site URL, e.g. `https://<your-domain>`
   - `HK_ADMIN_EMAIL`: the admin login email
   - `HK_ADMIN_PASSWORD_HASH`: from `npx tsx scripts/hk-hash-secret.ts '<password, 10+ chars>'`
   - `BLOB_READ_WRITE_TOKEN`: create a Vercel Blob store and connect it to the project
3. Sign in at `/hk-admin/login`. Add locations (stand at the property and use "Use my current location"), then checklists, then housekeepers with their mobile number and PIN, and assign locations.

## How access works

- Housekeepers sign in with mobile number and a PIN set by the admin. Five wrong PINs lock the account for 15 minutes. Deactivating a housekeeper cuts them off immediately.
- The admin is one account defined by env vars.
- `/hk` and `/hk-admin` are checked in the proxy and again in every page, server action and route handler.
- The rest of the OS has no login yet. A signed-in housekeeper is redirected into `/hk` and blocked from other pages and APIs, but a person with no session can still open the open dashboard. Locking down the whole OS is a separate rollout.

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
