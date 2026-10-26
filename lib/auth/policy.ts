// Which paths are public. Everything else in the OS requires the admin session. Shared by the proxy and tests.
//
// Public on purpose:
//   /login                 - the sign-in page (and its sign-in server action)
//   /stay/<id>             - the guest portal (guests open it from their booking link; never shows admin data)
//   /api/stay/<id>/...     - the guest portal's own API (chat, tickets, membership join for that stay)
//   /api/whatsapp/webhook  - Twilio's inbound webhook (machine-to-machine)
//   /sign/<token>          - a guest e-signs their Long Stay agreement (shows only that one agreement)
//   /api/sign/<token>/...  - that signing page's OTP, sign and signed-PDF endpoints (same one agreement only)
//
// Machine-only (no admin session, but a server-side secret is required):
//   /api/cron/...          - scheduled jobs; need "Authorization: Bearer <CRON_SECRET>" (lib/auth/cron.ts),
//                            refused outright when CRON_SECRET is not configured
//   /api/inbox/inbound-email - inbound OTA/guest emails for the unified inbox; the route itself requires
//                            INBOX_WEBHOOK_SECRET and refuses every request when it is not configured

// Server actions are invoked by POSTing to the page that renders them, so the only places an unauthenticated
// action call can even reach are /login (sign-in), /stay/<id> (the guest portal's membership actions) and /sign/<token> (no actions).
// Every admin server action also checks the session itself, wherever it is posted.
//   /api/whatsapp/meta-webhook - Meta's inbound webhook (machine-to-machine; verifies X-Hub-Signature-256 itself and
//                            refuses everything when META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN are not set)
//   /api/whatsapp/meta-audit   - read-only Meta audit; 404 everywhere except Preview with a matching META_AUDIT_KEY
const PUBLIC_EXACT = new Set(["/login", "/api/whatsapp/webhook", "/api/whatsapp/meta-webhook", "/api/whatsapp/meta-audit"])
const PUBLIC_PREFIXES = ["/stay/", "/api/stay/", "/sign/", "/api/sign/"]
const CRON_PREFIX = "/api/cron/"
// Machine endpoints that authenticate themselves with their own secret (no admin session needed or used).
const SELF_AUTHENTICATED_MACHINE_PATHS = new Set(["/api/inbox/inbound-email"])

function normalise(pathname: string): string {
  // Collapse repeated slashes and drop one trailing slash, so "/leads/" or "//leads" cannot slip past a check.
  let p = pathname.replace(/\/{2,}/g, "/")
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1)
  return p
}

export function isPublicPath(pathname: string): boolean {
  const p = normalise(pathname)
  if (PUBLIC_EXACT.has(p)) return true
  return PUBLIC_PREFIXES.some((prefix) => p.startsWith(prefix) && p.length > prefix.length)
}

// Cron endpoints: no admin session, but the cron secret is required (checked in proxy.ts and in each route).
export function isCronPath(pathname: string): boolean {
  const p = normalise(pathname)
  return p === "/api/cron" || p.startsWith(CRON_PREFIX)
}

// Machine-only endpoints that check their own secret inside the route (e.g. INBOX_WEBHOOK_SECRET).
export function isSelfAuthenticatedMachinePath(pathname: string): boolean {
  return SELF_AUTHENTICATED_MACHINE_PATHS.has(normalise(pathname))
}
