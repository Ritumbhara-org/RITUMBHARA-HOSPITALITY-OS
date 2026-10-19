// Unit tests for lib/whatsapp/guest-messages-router.ts (Week 7 Guest Messages routing of inbound WhatsApp messages).
// The website and the database are fakes; the Twilio signature check is the real twilio.validateRequest.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import {
  guestAskUrl, isGuestStayTopic, routeToGuestMessages, type GuestMessagesRouterDeps, type GuestMessagesRouterInput,
} from "../lib/whatsapp/guest-messages-router";

const ASK_URL = "https://www.example.com/api/guest-messages/ask";
const SECRET = "fake-guest-api-secret-0123456789abcdef"; // fake, 38 chars
const AUTH_TOKEN = "fake-twilio-auth-token-0000";
const WEBHOOK_URL = "https://os.example.com/api/whatsapp/webhook";
const GUEST = "+919876543210";

function twilioBody(text: string, from = "whatsapp:" + GUEST, sid = "SM0123456789abcdef0123456789abcdef"): string {
  return new URLSearchParams({ MessageSid: sid, From: from, To: "whatsapp:+918306312778", Body: text, NumMedia: "0" }).toString();
}
function signed(text: string, opts: { from?: string; badSignature?: boolean } = {}): GuestMessagesRouterInput {
  const rawBody = twilioBody(text, opts.from);
  const params = Object.fromEntries(new URLSearchParams(rawBody).entries());
  const signature = opts.badSignature ? "not-a-real-signature" : twilio.getExpectedTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params);
  return { senderPhone: (opts.from || "whatsapp:" + GUEST).replace("whatsapp:", ""), text, rawBody, signature };
}

function fakeDeps(reply: unknown, opts: { status?: number; known?: boolean; overrides?: Partial<GuestMessagesRouterDeps> } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logged: string[] = [];
  const knownLookups: string[] = [];
  const events: string[] = [];
  const deps: GuestMessagesRouterDeps = {
    askUrl: ASK_URL,
    apiSecret: SECRET,
    webhookUrl: WEBHOOK_URL,
    authToken: AUTH_TOKEN,
    isKnownContact: async (p) => { knownLookups.push(p); return !!opts.known; },
    validateSignature: (token, sig, url, params) => twilio.validateRequest(token, sig, url, params),
    logOutbound: async (_to, text) => { logged.push(text); },
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init || {} });
      if (reply instanceof Error) throw reply;
      return new Response(typeof reply === "string" ? reply : JSON.stringify(reply), { status: opts.status || 200 });
    }) as typeof fetch,
    log: (e) => { events.push(e); },
    ...(opts.overrides || {}),
  };
  return { deps, calls, logged, knownLookups, events };
}

const ESCALATED = {
  ok: true, outcome: "escalated", reason: "BOOKING_CHANGE", intent: null, escalationId: "E-0123456789", stored: true, bookingVerified: true,
  reply: "Thanks for your message. I've passed it to our team, and someone will get back to you here shortly.",
};

test("topic check: only questions about an existing stay are routed", () => {
  for (const q of [
    "Can I extend my stay by 2 nights?", "Is an extension possible?", "Can I get one more night?", "early check-in please",
    "Can I check in early?", "Late checkout possible?", "I want to cancel my booking", "Please reschedule my stay",
    "Can I change my booking dates?", "When will I get my refund?", "What is the check-in time?", "What time can I check out?",
  ]) assert.equal(isGuestStayTopic(q), true, q);
  for (const q of ["Hi", "I want to book a studio in Jaipur for 2 people", "Ref: W-FLOATING", "What is the price?", "Do you have parking?", "5th to 7th November"]) {
    assert.equal(isGuestStayTopic(q), false, q);
  }
})

test("ask URL must be https and exactly /api/guest-messages/ask", () => {
  assert.equal(guestAskUrl(ASK_URL), ASK_URL);
  for (const bad of [undefined, "", "http://www.example.com/api/guest-messages/ask", "https://www.example.com/api/guest-messages/run", "https://www.example.com/api/guest-messages/ask?x=1", "not a url"]) {
    assert.equal(guestAskUrl(bad), null, String(bad));
  }
});

test("off unless every setting is present: nothing is looked up or called", async () => {
  for (const missing of ["askUrl", "apiSecret", "webhookUrl", "authToken"] as const) {
    const f = fakeDeps(ESCALATED, { overrides: { [missing]: undefined } });
    assert.equal(await routeToGuestMessages(signed("Can I extend my stay?"), f.deps), null, missing);
    assert.equal(f.calls.length + f.knownLookups.length, 0, missing);
  }
  const short = fakeDeps(ESCALATED, { overrides: { apiSecret: "short" } });
  assert.equal(await routeToGuestMessages(signed("Can I extend my stay?"), short.deps), null);
  assert.equal(short.calls.length, 0);
});

test("unrelated messages, known OS contacts and unsigned/forged requests keep the old flow (null, no website call)", async () => {
  const lead = fakeDeps(ESCALATED);
  assert.equal(await routeToGuestMessages(signed("I want to book a studio for 2 people"), lead.deps), null);
  assert.equal(lead.knownLookups.length + lead.calls.length, 0, "not a stay topic: no DB lookup, no call");

  const known = fakeDeps(ESCALATED, { known: true });
  assert.equal(await routeToGuestMessages(signed("Can I extend my stay?"), known.deps), null);
  assert.deepEqual(known.knownLookups, [GUEST]);
  assert.equal(known.calls.length, 0, "OS guests and staff keep the OS AI / ticket flow");

  const forged = fakeDeps(ESCALATED);
  assert.equal(await routeToGuestMessages(signed("Can I extend my stay?", { badSignature: true }), forged.deps), null);
  assert.equal(await routeToGuestMessages({ ...signed("Can I extend my stay?"), signature: null }, forged.deps), null);
  const tampered = signed("Can I extend my stay?");
  assert.equal(await routeToGuestMessages({ ...tampered, rawBody: twilioBody("Please cancel my booking") }, forged.deps), null, "signature covers the body");
  assert.equal(forged.calls.length, 0);
  assert.ok(forged.events.includes("signature_rejected"));

  const failingLookup = fakeDeps(ESCALATED, { overrides: { isKnownContact: async () => { throw new Error("db down"); } } });
  assert.equal(await routeToGuestMessages(signed("Can I extend my stay?"), failingLookup.deps), null);
  assert.equal(failingLookup.calls.length, 0);
});

test("verified guest: asks the website with requireBooking, returns its reply as escaped TwiML and logs it", async () => {
  const f = fakeDeps({ ...ESCALATED, reply: "Thanks <team> & co" });
  const twiml = await routeToGuestMessages(signed("Can I extend my stay by one night?"), f.deps);
  assert.equal(twiml, "<Response><Message>Thanks &lt;team&gt; &amp; co</Message></Response>");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, ASK_URL);
  assert.equal(f.calls[0].init.method, "POST");
  assert.equal((f.calls[0].init.headers as Record<string, string>).Authorization, "Bearer " + SECRET);
  assert.equal(f.calls[0].init.redirect, "manual");
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), {
    question: "Can I extend my stay by one night?", phone: GUEST, channel: "whatsapp", requireBooking: true, messageId: "SM0123456789abcdef0123456789abcdef",
  });
  assert.deepEqual(f.logged, ["Thanks <team> & co"]);

  const answered = fakeDeps({ ok: true, outcome: "answered", intent: "check_in_time", reply: "Check-in at Studio 925 is from 13:00 – 23:00.", bookingVerified: true });
  assert.match(String(await routeToGuestMessages(signed("What is the check-in time?"), answered.deps)), /Check-in at Studio 925 is from 13:00 – 23:00\./);
});

test("not a guest, older website, errors and timeouts all fall back to the old flow (null)", async () => {
  const cases: [string, unknown, number?][] = [
    ["not_guest", { ok: true, outcome: "not_guest" }],
    ["older website without requireBooking", { ...ESCALATED, bookingVerified: undefined }],
    ["unauthorised", { ok: false, error: "unauthorized" }, 401],
    ["route off on the website", { ok: false, error: "not_found" }, 404],
    ["server error", {}, 500],
    ["not JSON", "<html>oops</html>"],
    ["empty reply", { ...ESCALATED, reply: "" }],
    ["network", new Error("ECONNRESET")],
  ];
  for (const [label, reply, status] of cases) {
    const f = fakeDeps(reply, { status });
    assert.equal(await routeToGuestMessages(signed("Please cancel my booking"), f.deps), null, label);
    assert.deepEqual(f.logged, [], label + ": nothing logged as sent");
  }
  const slow = fakeDeps(ESCALATED, {
    overrides: {
      timeoutMs: 20,
      fetchImpl: ((_u: string, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch,
    },
  });
  assert.equal(await routeToGuestMessages(signed("Please cancel my booking"), slow.deps), null);
  assert.ok(slow.events.includes("ask_unreachable"));
});

test("logs never contain the full phone number, the message or the secret", async () => {
  const lines: string[] = [];
  const f = fakeDeps(ESCALATED, { overrides: { log: (e, m) => { lines.push(e + " " + JSON.stringify(m || {})); } } });
  await routeToGuestMessages(signed("Can I extend my stay?"), f.deps);
  await routeToGuestMessages(signed("Can I extend my stay?", { badSignature: true }), f.deps);
  const all = lines.join("\n");
  assert.doesNotMatch(all, new RegExp(SECRET + "|9876543210|extend"));
  assert.match(all, /\*\*\*3210/);
});
