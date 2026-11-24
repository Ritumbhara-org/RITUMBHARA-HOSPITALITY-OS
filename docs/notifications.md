# Admin notifications

The bell in the top bar (phone and desktop) shows what needs the admin's attention: a count of unread items, a
list to open, and a pop-up toast when something new arrives while the OS is open. Tapping an item marks it read
and opens the page where the admin can act.

## What raises a notification

| Event | Level | Opens |
|---|---|---|
| Guest or lead writes on WhatsApp (not staff commands like ACCEPT) | Action | Inbox |
| New guest email from Airbnb, Booking.com, Agoda, Expedia, MakeMyTrip or plain email | Action | Inbox |
| New booking (stays that already ended are skipped) | Info | Reservations |
| Booking cancelled | Action | Reservations |
| Guest request or complaint (guest portal form, portal chat, WhatsApp AI chat) | Action, or Critical if priority is critical | Operations |
| Ticket passed its SLA deadline | Critical | Operations |
| Guest redeemed loyalty points (front desk must deduct from the bill) | Action | Operations |
| Long stay agreement signed | Info | Long Stays |
| IntelliStay booking sync failed | Critical | Reservations |

Several messages from the same guest or conversation, or repeats about the same ticket, collapse into one unread
row with a count (for example "×3") instead of filling the list.

## How it works

- `AdminNotification` table (Prisma). One shared feed, because the OS has one admin sign-in.
- `lib/notifications/builders.ts` writes the wording for each event. `service.ts` stores, lists and marks read.
  `listeners.ts` turns event-bus events (bookings, tickets, SLA, points) into notifications.
- WhatsApp, email, long-stay and sync notifications are raised where those things arrive
  (`app/api/whatsapp/webhook`, `lib/inbox/ingest.ts`, `lib/long-stay/signing.ts`, `app/api/cron/sync`).
- `GET /api/notifications` lists the feed. `POST` with `{ ids: [...] }` or `{ all: true }` marks read.
  Both need the admin session. The bell polls every 30 seconds while the tab is visible.
- Read notifications older than 30 days are deleted by the daily cleanup job.
- Notifications never block the real work. If recording one fails (for example the table is missing), it is logged
  and the webhook, sync or booking carries on.

## Setup (once)

```bash
npx prisma db push
```

This only adds the `AdminNotification` table. Until it runs the bell shows a setup notice and nothing else changes.

Without database access from your machine, run `prisma/sql/2026-10-28_admin_notifications.sql` in the Supabase SQL
editor instead. It does the same and is safe to run twice.

## Phone alerts (push)

Every notification is also pushed to phones that turned alerts on, so the admin is told even when the app is closed.

- `PushSubscription` table: one row per phone or browser. `lib/notifications/push.ts` sends; `notifyAdmin()` calls it.
  A repeat of the same thing reuses the notification tag, so the phone replaces the alert instead of stacking them.
- `public/sw.js` shows the alert and opens the right page when it is tapped.
- `GET/POST/DELETE /api/notifications/push` (admin session only) give the public key and save or remove a phone.
- Phones that stop answering (404/410) are forgotten automatically. Push never blocks the real work.
- Without the VAPID keys below, push does nothing and the bell footer says setup is needed.

### Setup (once)

1. Make a key pair: `npx web-push generate-vapid-keys`
2. In Vercel, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (optional `VAPID_SUBJECT`, for example `mailto:you@example.com`), then redeploy.
3. Run `npx prisma db push`, or run `prisma/sql/2026-10-28_push_subscriptions.sql` in the Supabase SQL editor.
4. On each phone: open the installed app, tap the bell, tap **Turn on phone alerts**, allow notifications.
   You get a test alert straight away.

iPhone: alerts only work after the app is added to the Home Screen (Share, then Add to Home Screen) and opened from there.
Android and desktop Chrome work from the installed app or the browser.

Keep the private key secret. Changing the keys later stops existing phones, who then need to turn alerts on again.
