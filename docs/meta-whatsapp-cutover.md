# Meta WhatsApp Cloud API — Production cutover runbook (Phase 2)

Twilio stays the default until step 7. Nothing in this document is done automatically.

## 1. Production environment variables

Add these in Vercel → Project → Settings → Environment Variables, **Production** scope. Values live only in Vercel.

| Name | Required | What it is |
|---|---|---|
| `META_WA_ACCESS_TOKEN` | yes | Permanent System User token with `whatsapp_business_messaging` + `whatsapp_business_management` |
| `META_WA_PHONE_NUMBER_ID` | yes | Phone number ID (digits) from WhatsApp Manager → API Setup |
| `META_WA_DISPLAY_NUMBER` | yes | The number in E.164, e.g. `+91…` (shown as "from" in the log and to guests on /stay) |
| `META_APP_SECRET` | yes | Meta app → App settings → Basic → App secret (verifies `X-Hub-Signature-256`) |
| `META_WEBHOOK_VERIFY_TOKEN` | yes | Any random string, at least 16 characters; the same value is entered in the Meta webhook form |
| `META_WA_MESSAGING_ACCOUNT_ID` | only if the token reaches more than one Messaging account | Digits |
| `META_GRAPH_API_VERSION` | no | Defaults to `v23.0` |
| `META_WA_TEMPLATE_LANGUAGE` | no | Defaults to `en`; set e.g. `en_US` if templates were approved under that code |
| `META_WA_TEMPLATES` | no | JSON overrides when an approved template name differs, e.g. `{"booking_confirmation":{"name":"booking_confirmation_v3"}}` |
| `WEBSITE_LEAD_BOT_META_URL` | if the website lead bot is used | Lead-bot endpoint for Meta conversations |
| `WHATSAPP_PROVIDER` | **leave unset until step 7** | `meta` switches all business-initiated sends to Meta |

Leave `META_AUDIT_KEY` unset in Production (the audit route only works on Preview).

## 2. Meta templates that must be approved (same names, or mapped via `META_WA_TEMPLATES`)

team_new_task, ticket_resolved, ticket_resolved_custom, day_of_arrival_reminder, post_stay_thank_you, ticket_assigned,
pre_arrival_instructions, checkout_instructions, sla_breach_alert, booking_confirmation, points_redemption_alert,
long_stay_sign_link, long_stay_otp (authentication), long_stay_signed, loyalty_points_credited, loyalty_birthday_bonus,
loyalty_anniversary_bonus, loyalty_referral_bonus, loyalty_tier_upgrade, loyalty_points_expiring,
loyalty_points_expired, loyalty_otp (authentication), loyalty_redemption_success.

Body parameters are positional `{{1}}, {{2}}, …` in the same order as the Twilio content variables.
A template that is missing or rejected falls back to free text, which Meta only delivers inside the 24-hour window.

## 3. Meta webhook configuration

- Callback URL: `https://<production-domain>/api/whatsapp/meta-webhook`
- Verify token: the value of `META_WEBHOOK_VERIFY_TOKEN`
- Subscribe the field **`messages`** (carries inbound messages and sent/delivered/read/failed statuses)
- Subscribe the app to the WABA (WhatsApp Manager, or `POST /<WABA_ID>/subscribed_apps`)

## 4. Database migration (Production)

`prisma/sql/2026-11-24_whatsapp_provider_message_id.sql`, which adds one nullable column and one index, and can be run more than once.
Run it **before** deploying the code: the Prisma client selects every column.

```sql
BEGIN;
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_providerMessageId_idx" ON "WhatsAppMessage"("providerMessageId");
COMMIT;
```

Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='WhatsAppMessage' AND column_name='providerMessageId';`

## 5. Rollout sequence

1. Take and verify a database backup.
2. Preview check: Preview env with Meta's **test number**, webhook pointed at the Preview URL (append
   `?x-vercel-protection-bypass=<bypass secret>` if Deployment Protection is on). Send from an allow-listed staff phone:
   inbound text, staff command, reply, template, and confirm the row goes SENT → DELIVERED → READ.
3. Run the SQL migration on Production (section 4).
4. Add the Production env vars from section 1, **without** `WHATSAPP_PROVIDER`.
5. Merge PR #43 → Production deploy. Twilio behaviour is unchanged; the Meta webhook is live but idle.
6. Configure the Meta webhook (section 3) and confirm the GET verification succeeds in the Meta dashboard.
7. Number decision (see rollback). Then set `WHATSAPP_PROVIDER=meta` and redeploy (env changes need a new deployment).
8. Smoke test with staff numbers only: inbound, staff reply, a booking-confirmation template, loyalty OTP, long-stay OTP,
   Unified Inbox reply inside and outside 24 h (outside must show the window-closed message).
9. Watch for 7 days: `[Meta WhatsApp] send failed`, `delivery_failed code=`, share of `WINDOW_CLOSED`.
10. Then raise the Twilio removal PR (section 7).

## 6. Rollback to Twilio

- **While Twilio still owns the production number:** remove `WHATSAPP_PROVIDER` (or set `twilio`) and redeploy, or use
  Vercel Instant Rollback to the previous deployment. Takes effect within minutes. Leave the DB column; nothing on the Twilio path uses it.
- **After the production number has been migrated to Meta Cloud API:** Twilio can no longer send from that number, so
  switching the env var back makes every Twilio send fail. Rolling back then means migrating the number back to
  Twilio, which takes hours to days. Keep the Twilio number until Meta has been stable, or run Meta on a separate number first.
- Conversations that arrive on the Meta number are always answered via Meta, whatever `WHATSAPP_PROVIDER` says.

## 7. Twilio removal (after successful cutover only)

Code:
- `lib/whatsapp/client.ts`: the Twilio branch, `contentSidMap`, `import twilio`
- `lib/loyalty/notify.ts`: Twilio transport branch; `lib/loyalty/template-ids.ts`: Twilio SIDs / `LOYALTY_WA_TEMPLATES`
- `lib/long-stay/server.ts`: Twilio branch, `TEMPLATE_ENV`, hard-coded OTP content SID
- `app/api/whatsapp/webhook/route.ts`: the Twilio inbound webhook (plus its entry in `lib/auth/policy.ts` PUBLIC_EXACT)
- `lib/twilio/preview-guard.ts`, and the Twilio parts of `lib/whatsapp/guest-messages-router.ts` and `lib/whatsapp/website-lead-router.ts`
- `lib/whatsapp/meta/config.ts`: `TWILIO_WHATSAPP_NUMBER` in `systemWhatsAppNumber` / `allSystemWhatsAppNumbers`
- `components/whatsapp/templates-config.ts` (`TWILIO_TEMPLATES`) and the Twilio sandbox note in `whatsapp-client.tsx`
- `lib/whatsapp/test-whatsapp.ts`, `scripts/send-booking-confirmations.ts`, `scripts/trigger-confirmations.ts` (Twilio wording only)
- Tests: `twilio-preview-guard`, `whatsapp-webhook-route`, and the Twilio cases in `guest-messages-router`, `website-lead-router`, `loyalty-rules`, `cron-auth`
- `package.json`: the `twilio` dependency (then `npm install` to update the lockfile)

Env vars to delete from Vercel (all environments): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`,
`TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_WEBHOOK_URL`, `LONG_STAY_SIGN_TEMPLATE_SID`, `LONG_STAY_OTP_TEMPLATE_SID`,
`LONG_STAY_SIGNED_TEMPLATE_SID`, `LOYALTY_WA_TEMPLATES`, `WEBSITE_LEAD_BOT_URL` (if only the Twilio lead bot used it).
Then remove the webhook URL from the Twilio console and close the Twilio WhatsApp sender.
Do not delete `META_APP_SECRET`: it is also read by the Instagram webhook when no Instagram-specific secret is set.

## Behaviour changes to know about

- **Broadcasts** (`app/actions/whatsapp.ts`) send free text. On Meta they only reach guests who wrote within 24 h; the rest
  are counted as not sent. Marketing broadcasts need an approved Meta marketing template.
- Statuses now move SENT → DELIVERED → READ (or FAILED) by webhook. Twilio logged DELIVERED at send time.
