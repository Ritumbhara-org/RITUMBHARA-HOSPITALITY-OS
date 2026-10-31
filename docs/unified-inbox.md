# Unified Inbox

One page (`/inbox`) where the team reads and replies to guest messages from every channel:
WhatsApp, Instagram DMs, Airbnb, Booking.com, Agoda, Expedia, MakeMyTrip / Goibibo and plain email.

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
| Instagram | Meta's Instagram webhook (`/api/instagram/webhook`) | Yes, within 24 hours of the guest's last message (7 days with the Human Agent permission). Replies sent from the Instagram app also show up in the thread. |
| Booking.com, Agoda, Expedia | OTA notification emails, sent in by the Gmail bridge (`scripts/gmail-to-inbox.gs`) | Yes, once sending is on (step 3): the reply leaves from the same Gmail account, in the same email thread. |
| Airbnb | Same | No. Airbnb stopped accepting email replies in October 2023. Draft in the OS, copy, reply in Airbnb. Sending from the OS needs a channel manager with Airbnb's messaging API. |
| MakeMyTrip / Goibibo | Same, for messages MMT sends by email | Only if the email has a reply address. Guest chat on MMT lives in the Connect app, which has no email or API route. |
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

### 3. Send replies from the OS

**Recommended: through the Gmail bridge.** The Apps Script that brings OTA emails in also sends the replies.
Replies go out from the Gmail account each OTA already emails, so no new address has to be approved.

1. In the Apps Script project: **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Deploy.
   (Every request must carry `INBOX_SECRET`, and the script only ever replies to OTA emails.)
2. Copy the web app URL into Vercel as `GMAIL_BRIDGE_URL` and redeploy.
3. On each OTA, make sure guest messages are emailed to that Gmail account:
   - **Booking.com:** Extranet → Property → Contacts: the Reservations contact uses this Gmail, guest-message emails on.
     Extranet → Account → Security: add this Gmail as an approved sender, and keep "block all email communication" off.
   - **Agoda:** YCS → Contacts: this Gmail receives guest messages.
   - **Expedia:** in Partner Central, set the contact that receives guest messages to this Gmail.
   - **MakeMyTrip / Goibibo:** in the Connect app, set the property's reservation email to this Gmail.
4. Messages that arrived before step 1 can't be answered from the OS (they lack Gmail's id); new ones can.

After editing the script later, publish a new version: Deploy → Manage deployments → edit → New version.

**Alternative: Resend.** Set:

- `RESEND_API_KEY`: API key from resend.com, with the sending domain verified.
- `INBOX_FROM_EMAIL`: the address replies come from. For OTA relays this should be the **same email address
  registered on the OTA account**, otherwise the OTA may reject the reply.

Test one reply per OTA after setup. Each OTA decides whether it accepts replies by email.

## Code map

- `prisma/schema.prisma`: `InboxConversation`, `InboxMessage`, `InboxChannel`, `InboxConversationStatus`
- `lib/inbox/email-parser.ts`: turns inbound emails into messages (tested in `tests/inbox-email-parser.test.ts`)
- `lib/inbox/ingest.ts`: stores messages and matches bookings
- `lib/inbox/service.ts`: conversation list, threads, replies, assignment, AI draft
- `lib/inbox/email-send.ts`: outbound replies through the Gmail bridge, or Resend
- `scripts/gmail-to-inbox.gs`: Gmail bridge (brings OTA emails in, sends replies out)
- `prisma/sql/2026-10-26_inbox_makemytrip.sql`: adds the MakeMyTrip channel to the database
- `lib/inbox/quick-replies.ts`: saved replies
- `app/api/inbox/inbound-email/route.ts`: inbound email webhook
- `app/actions/inbox.ts`, `app/(dashboard)/inbox/page.tsx`, `components/inbox/inbox-client.tsx`: the page


## Instagram DMs

Guest DMs to the business Instagram account land in the inbox as their own channel (pink **Instagram** badge),
and the team replies from the OS. Story replies, story mentions, photos and shared posts show as short labels
(`[Photo]`, `[Replied to your story] ...`); open Instagram to see the media.

### Setup (once)

1. The Instagram account must be a **Professional** (Business or Creator) account. In the Instagram app:
   Settings → Messages and story replies → Message controls → Connected tools → turn on **Allow access to messages**.
2. In [developers.facebook.com](https://developers.facebook.com), use the existing Meta app (or create a Business app) and add
   the **Instagram** product → **API setup with Instagram login**.
   - Add the Instagram account and **Generate token**. Copy it as `INSTAGRAM_ACCESS_TOKEN`.
   - Copy the **Instagram app secret** as `INSTAGRAM_APP_SECRET`.
   - Pick a long random string as `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
3. Configure webhooks in the same screen:
   - Callback URL: `https://<os-domain>/api/instagram/webhook`
   - Verify token: the `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` value
   - Subscribe to the **messages** field (and **message_echoes** if listed, so replies sent from the Instagram app appear too).
4. `INSTAGRAM_ACCOUNT_ID`: the account's id as webhooks report it. Easiest way: send the account a test DM after deploying;
   if the id is wrong or missing, the Vercel log shows `[instagram-webhook] delivery for other account id(s): <id>`. Use that id.
   (It is also the `user_id` from `GET https://graph.instagram.com/me?fields=user_id,username`.)
5. Add the four variables in Vercel (Production), run `prisma/sql/2026-10-31_inbox_instagram.sql` once (or `npx prisma db push`), and redeploy.
6. While the Meta app is in **Development** mode only accounts with a role on the app can DM it. To receive DMs from the public,
   submit the app for **App Review** with `instagram_business_basic` and `instagram_business_manage_messages`, then switch it to Live.

| Variable | Required | What it is |
|---|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | yes | Instagram user token (Instagram Login) or Page token (Facebook Login). Long-lived tokens last 60 days; refresh before expiry. |
| `INSTAGRAM_ACCOUNT_ID` | yes | Our Instagram account id from webhooks (`entry.id`). |
| `INSTAGRAM_APP_SECRET` | yes* | Signs the webhook. *Falls back to `META_APP_SECRET`. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | yes* | Webhook handshake. *Falls back to `META_WEBHOOK_VERIFY_TOKEN`. |
| `INSTAGRAM_API_HOST` | no | `graph.instagram.com` (default) or `graph.facebook.com` for a Facebook-Page-linked setup. |
| `INSTAGRAM_HUMAN_AGENT` | no | `true` once Meta approves the Human Agent permission: allows replies up to 7 days after the guest's last message. |

Without these settings the webhook refuses everything and Instagram threads say "Reply in the Instagram app".
