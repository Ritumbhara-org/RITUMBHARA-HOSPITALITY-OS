# Long Stays

Monthly and extended stays the team books directly (not through IntelliStay). One record per stay: guest, ID copy,
dates, price, inclusion, security deposit, check-in/check-out photos and videos, and the guest's e-signed agreement.

- Sidebar: **Long Stays**, under Reservations → `/long-stay`
- New booking: `/long-stay/new` · Booking: `/long-stay/<id>`
- Guest signing page (public, phone-first): `/sign/<token>`

## Setup (once)

1. **Database** — Supabase → SQL editor → run `prisma/sql/2026-10-25_long_stay_bookings.sql`.
   It only adds four enums and two tables (`LongStayBooking`, `LongStayAgreement`). Or run `npx prisma db push`.
2. **File storage** — Vercel → project → Storage → Create Blob store → connect it to this project
   (adds `BLOB_READ_WRITE_TOKEN`) → redeploy. Files are private and only open for signed-in admins.
3. **WhatsApp templates** — messages the business starts need approved templates. Create these in Twilio
   (Content Template Builder), get them approved for WhatsApp, and set the Content SIDs:

   | Env var | Sent when | Variables |
   | --- | --- | --- |
   | `LONG_STAY_SIGN_TEMPLATE_SID` | Staff tap **Send for e-sign** | `{{1}}` guest first name, `{{2}}` signing link |
   | `LONG_STAY_OTP_TEMPLATE_SID` | Guest asks for a code (authentication template) | `{{1}}` 6-digit code |
   | `LONG_STAY_SIGNED_TEMPLATE_SID` | Guest has signed | `{{1}}` guest first name, `{{2}}` signed PDF link |

   Without a SID the plain text is sent, which WhatsApp only delivers if the guest messaged you in the last 24 hours.
   Uses the existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_NUMBER`.
4. `NEXT_PUBLIC_APP_URL` should be the production URL, so links sent to guests point at it.
5. Optional: with `RESEND_API_KEY` and `INBOX_FROM_EMAIL` set, the signed PDF link is also emailed when the booking has an email.

## How staff use it

1. Guest confirms → create the booking (guest, ID copy, dates, price, deposit) → **Send for e-sign**.
2. Just before check-in → open the booking on a phone, add photos/videos of every room, fittings, appliances and
   meter readings under *Just before check-in*. Set status to *Checked in* (only possible once signed).
3. Right after check-out → record the same angles under *Right after check-out*. Set status to *Checked out*.
4. Compare both sets → enter any deduction and reason → refund → enter the refund date.

## Rules

- Nights = check-out − check-in (check-out day isn't a night). Suggested total: per night = rate × nights;
  per month = rate ÷ 30 × nights, rounded. Staff can overwrite it; **Use suggested** puts it back.
- Checked in only after the guest has e-signed. Validation runs in the browser and again in the server action
  (`lib/long-stay/shared.ts`).
- The agreement is frozen when the link is sent (snapshot + SHA-256). Changing guest name/ID, unit, dates, inclusion,
  rent, total, advance, deposit or terms voids the link or signature; a new one must be sent. Fixing the phone number,
  email or notes doesn't.
- Signing links last 7 days. Only a hash of the token is stored, so copy the link when it's shown; **Resend** makes a new one.
- OTP: 6 digits on WhatsApp, valid 10 minutes, 1 per minute and 5 per link; 5 wrong codes lock the link.
- The signed PDF has the agreement, the signature and an audit trail (name, IST time, verified phone, IP, device, hash).
  Its built-in font only covers Latin text; names in other scripts show as `?` in the PDF (they are kept in the database).

## Files

All under `long-stay/<bookingId>/` in the private Blob store: `id/`, `checkin/`, `checkout/`, `agreement/`.
Uploads go straight from the browser (`/api/long-stay/upload`, admin-only, images/videos/PDF up to 500 MB) and are
viewed through `/api/long-stay/media` (admin-only).

## Legal note

OTP + drawn signature + audit trail is widely used for rental and service agreements in India, but it is not Aadhaar
eSign under the IT Act. An Aadhaar eSign provider (Leegality, Digio, SignDesk) can be plugged in later. Confirm the
agreement wording and the default deposit terms with your lawyer before going live.
