# Unified Inbox

One page (`/inbox`) where the team reads and replies to guest messages from every channel:
WhatsApp, Airbnb, Booking.com, Agoda, Expedia and plain email.

## What the team can do

- See all guest conversations in one list, newest first, with unread dots and per-channel counts.
- Filter by **Open / Mine / Unassigned / Done**, by channel, by location, or search by guest, unit or message text.
- Reply from the OS (WhatsApp, and OTA/email once email sending is set up).
- Use **Quick replies** (check-in times, early check-in, directions, parking, ID rules, and so on), filled with the booking's details.
- Get an **AI draft** that uses the linked booking and the conversation (needs `GROQ_API_KEY`).
- **Assign** a conversation to a team member and mark it **Done**. A new guest message re-opens it.
- See the **booking** next to the chat (unit, dates, status, source, amount, notes) and link or change it by hand.

## How messages get in

| Channel | Source | Reply from the OS |
|---|---|---|
| WhatsApp | Existing Twilio webhook (`/api/whatsapp/webhook`) | Yes, inside the 24-hour window. Templates stay on the WhatsApp page. |
| Airbnb, Booking.com, Agoda, Expedia | OTA notification emails forwarded to `/api/inbox/inbound-email` | Yes, by replying to the OTA's relay address (needs email sending, below). Otherwise a button opens the extranet. |
| Email | Guest emails forwarded to the same endpoint | Yes (needs email sending) |

IntelliStay's API has no OTA guest-messaging endpoints, so OTA messages come from the notification
emails each OTA already sends. If the channel manager behind IntelliStay offers a messaging API later,
it can feed the same `InboxConversation` / `InboxMessage` tables.

## Setup

### 1. Create the tables (once)

The project manages the database with `prisma db push`. The change only adds two tables and two enums.

```bash
npx prisma db push
```

Until this runs, `/inbox` shows a setup notice instead of failing.

### 2. Receive OTA emails

1. Set `INBOX_WEBHOOK_SECRET` in Vercel to a long random string.
2. Pick an inbound-email service that POSTs emails to a URL, for example Postmark Inbound, SendGrid Inbound Parse,
   or a Cloudflare Email Routing worker. Point it at:

   ```
   https://<your-domain>/api/inbox/inbound-email?token=<INBOX_WEBHOOK_SECRET>
   ```

   (or send the secret as an `x-inbox-secret` header). JSON and form posts are both accepted.
3. In the mailbox that receives OTA notifications (the one registered on Airbnb, Booking.com and Agoda), add an
   **auto-forward filter** for mail from `airbnb.com`, `booking.com`, `agoda.com` and `expedia.com` to that service's address.
   Auto-forwarding keeps the original sender and Reply-To, which the inbox needs to reply. Manually forwarded
   emails are read too, but usually lose the Reply-To, so they can only be answered from the extranet.

The parser picks out the channel, guest name and reservation code (for example Airbnb `HM…` codes), then links
the conversation to the matching booking by code or guest name. Wrong or missing matches can be fixed with
**Link a booking** on the right-hand panel.

### 3. Send replies by email (optional but recommended)

Set:

- `RESEND_API_KEY`: API key from resend.com, with the sending domain verified.
- `INBOX_FROM_EMAIL`: the address replies come from. For OTA relays this should be the **same email address
  registered on the OTA account**, otherwise the OTA may reject the reply.

Test one reply per OTA after setup. Each OTA decides whether it accepts replies by email.

## Code map

- `prisma/schema.prisma`: `InboxConversation`, `InboxMessage`, `InboxChannel`, `InboxConversationStatus`
- `lib/inbox/email-parser.ts`: turns inbound emails into messages (tested in `tests/inbox-email-parser.test.ts`)
- `lib/inbox/ingest.ts`: stores messages and matches bookings
- `lib/inbox/service.ts`: conversation list, threads, replies, assignment, AI draft
- `lib/inbox/email-send.ts`: outbound email through Resend
- `lib/inbox/quick-replies.ts`: saved replies
- `app/api/inbox/inbound-email/route.ts`: inbound email webhook
- `app/actions/inbox.ts`, `app/(dashboard)/inbox/page.tsx`, `components/inbox/inbox-client.tsx`: the page
