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

test("not a guest, older website and errors all fall back to the old flow (null)", async () => {
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
  const network = fakeDeps(new Error("ECONNRESET"));
  await routeToGuestMessages(signed("Please cancel my booking"), network.deps);
  assert.ok(network.events.includes("ask_unreachable"), "network errors keep the old log event");
  assert.ok(!network.events.includes("ask_timeout_suppressed"));
});

test("timeout: empty TwiML (not null) so the lead bot cannot answer a stay question the website may still escalate", async () => {
  let asked = 0;
  const slow = fakeDeps(ESCALATED, {
    overrides: {
      timeoutMs: 20,
      fetchImpl: ((_u: string, init?: RequestInit) => new Promise((_res, rej) => {
        asked++;
        init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch,
    },
  });
  assert.equal(await routeToGuestMessages(signed("Hi, I have a booking for Villa 65 Sariska. Can I extend my stay by one night?"), slow.deps), "<Response></Response>");
  assert.equal(asked, 1, "the website was asked once");
  assert.deepEqual(slow.logged, [], "no outbound message logged: nothing was sent to the guest");
  assert.ok(slow.events.includes("ask_timeout_suppressed"));
  assert.ok(!slow.events.includes("ask_unreachable"));
});

// Production incident (E-FFF6E04826): the website's verified booking check took ~6.2 s, the router gave up at 4 s and
// returned empty TwiML, so the escalation was stored but the guest never got the acknowledgement.
const VILLA_Q = "Hi, I have a booking for Villa 65 Sariska. Can I extend my stay by one night?";

function slowWebsite(reply: unknown, delayMs: number, status = 200) {
  let asked = 0;
  let aborted = false;
  const fetchImpl = ((_u: string, init?: RequestInit) => new Promise((resolve, reject) => {
    asked++;
    const t = setTimeout(() => {
      if (reply instanceof Error) reject(reply);
      else resolve(new Response(JSON.stringify(reply), { status }));
    }, delayMs);
    init?.signal?.addEventListener("abort", () => {
      aborted = true;
      clearTimeout(t);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  })) as unknown as typeof fetch;
  return { fetchImpl, asked: () => asked, aborted: () => aborted };
}

function lateDeps(reply: unknown, delayMs: number, opts: { status?: number; maxWaitMs?: number; sendOk?: boolean | Error } = {}) {
  const site = slowWebsite(reply, delayMs, opts.status);
  const deferred: Promise<void>[] = [];
  const sent: { to: string; text: string }[] = [];
  const f = fakeDeps(null, {
    overrides: {
      timeoutMs: 20,
      maxWaitMs: opts.maxWaitMs ?? 2000,
      fetchImpl: site.fetchImpl,
      defer: (p) => { deferred.push(p); },
      sendReply: async (to, text) => {
        if (opts.sendOk instanceof Error) throw opts.sendOk;
        sent.push({ to, text });
        return opts.sendOk ?? true;
      },
    },
  });
  return { ...f, site, deferred, sent, settle: () => Promise.all(deferred) };
}

test("slow website (verified escalation after the 4 s budget): empty TwiML now, then the same ack is sent once", async () => {
  const l = lateDeps(ESCALATED, 80);
  assert.equal(await routeToGuestMessages(signed(VILLA_Q), l.deps), "<Response></Response>", "Twilio is answered at once, no lead bot");
  assert.equal(l.deferred.length, 1, "the website call keeps running after the response");
  assert.deepEqual(l.sent, [], "nothing sent before the website answers");
  assert.ok(l.events.includes("ask_reply_deferred"));
  await l.settle();
  assert.equal(l.site.asked(), 1, "the website was asked once (no retry)");
  assert.equal(l.site.aborted(), false, "the slow call was not cut at 4 s");
  assert.deepEqual(l.sent, [{ to: GUEST, text: ESCALATED.reply }], "the verified acknowledgement reaches the guest once");
  assert.deepEqual(l.logged, [], "not logged twice: the Twilio sender logs the late message itself");
  assert.ok(l.events.includes("guest_escalated_sent_late"));
  assert.ok(!l.events.includes("ask_timeout_suppressed"));
});

test("slow website, late verified answer: sent as well", async () => {
  const answered = { ok: true, outcome: "answered", intent: "check_in_time", reply: "Check-in is from 13:00.", bookingVerified: true };
  const l = lateDeps(answered, 60);
  assert.equal(await routeToGuestMessages(signed("What is the check-in time?"), l.deps), "<Response></Response>");
  await l.settle();
  assert.deepEqual(l.sent.map((s) => s.text), ["Check-in is from 13:00."]);
  assert.ok(l.events.includes("guest_answered_sent_late"));
});

test("slow website, late not-guest / unverified / error / no answer: nothing is sent", async () => {
  const cases: [string, unknown, number, { status?: number; maxWaitMs?: number }?][] = [
    ["not_guest", { ok: true, outcome: "not_guest" }, 60],
    ["unverified (older website)", { ...ESCALATED, bookingVerified: undefined }, 60],
    ["server error", {}, 60, { status: 500 }],
    ["network", new Error("ECONNRESET"), 60],
    ["no answer within the hard limit", ESCALATED, 5000, { maxWaitMs: 100 }],
  ];
  for (const [label, reply, delay, o] of cases) {
    const l = lateDeps(reply, delay, o);
    assert.equal(await routeToGuestMessages(signed(VILLA_Q), l.deps), "<Response></Response>", label);
    await l.settle();
    assert.deepEqual(l.sent, [], label + ": nothing sent");
    assert.deepEqual(l.logged, [], label);
    assert.ok(l.events.some((e) => e.startsWith("late_")), label + ": logged as late, no reply");
  }
});

test("slow website, Twilio send fails: logged, never thrown", async () => {
  for (const sendOk of [false, new Error("twilio down")]) {
    const l = lateDeps(ESCALATED, 40, { sendOk });
    assert.equal(await routeToGuestMessages(signed(VILLA_Q), l.deps), "<Response></Response>");
    await l.settle();
    assert.ok(l.events.includes("late_reply_send_failed"));
  }
});

test("fast website with late sending enabled: unchanged TwiML reply, nothing deferred or sent separately", async () => {
  const l = lateDeps(ESCALATED, 0);
  l.deps.timeoutMs = 1000;
  assert.match(String(await routeToGuestMessages(signed(VILLA_Q), l.deps)), /^<Response><Message>Thanks for your message\./);
  assert.equal(l.deferred.length, 0);
  assert.deepEqual(l.sent, []);
  assert.deepEqual(l.logged, [ESCALATED.reply]);

  const notGuest = lateDeps({ ok: true, outcome: "not_guest" }, 0);
  notGuest.deps.timeoutMs = 1000;
  assert.equal(await routeToGuestMessages(signed(VILLA_Q), notGuest.deps), null, "not a guest still falls back to the lead bot");
  assert.equal(notGuest.deferred.length, 0);
});

test("production deps wire the late-reply path", async () => {
  const { defaultGuestMessagesRouterDeps } = await import("../lib/whatsapp/guest-messages-router");
  const d = defaultGuestMessagesRouterDeps();
  assert.equal(typeof d.defer, "function");
  assert.equal(typeof d.sendReply, "function");
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
