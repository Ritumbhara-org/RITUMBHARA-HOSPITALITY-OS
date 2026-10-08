import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isKnownPhone,
  routeToWebsiteLeadBot,
  twimlMessageTexts,
  websiteBotUrl,
  WEBSITE_LEAD_BOT_ENTITY,
  type LeadRouterDeps,
} from "../lib/whatsapp/website-lead-router";

const BOT_URL = "https://www.ritumbhara.com/api/whatsapp/inbound";
const RAW_BODY =
  "SmsMessageSid=SM00000000000000000000000000000001&Body=Hi%2C+I%27d+like+to+check+availability%0A%0ARef%3A+W-FLOATING" +
  "&From=whatsapp%3A%2B919000000001&To=whatsapp%3A%2B918306312778&AccountSid=AC00000000000000000000000000000000";
const INPUT = { senderPhone: "+919000000001", rawBody: RAW_BODY, signature: "c2lnbmF0dXJlLW5vdC1yZWFs" };
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Hi! When would you like to check in? (e.g. 12 Dec) &amp; how many guests?</Message></Response>';

interface Call { url: string; init: RequestInit }

function xmlResponse(body: string, status = 200, type = "text/xml; charset=utf-8") {
  return new Response(body, { status: status, headers: { "Content-Type": type } });
}

function harness(overrides: Partial<LeadRouterDeps> & { response?: () => Response | Promise<Response> } = {}) {
  const calls: Call[] = [];
  const logged: { to: string; text: string }[] = [];
  const events: string[] = [];
  let lookups = 0;
  const deps: LeadRouterDeps = {
    botUrl: BOT_URL,
    isKnownContact: async () => { lookups++; return false; },
    logOutbound: async (to, text) => { logged.push({ to, text }); },
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init || {} });
      return overrides.response ? overrides.response() : xmlResponse(TWIML);
    }) as typeof fetch,
    log: (event) => { events.push(event); },
    ...overrides,
  };
  return { deps, calls, logged, events, lookups: () => lookups };
}

// ---------- switch and configuration ----------

test("off when WEBSITE_LEAD_BOT_URL is unset: no lookup, no forward, normal OS flow", async () => {
  for (const botUrl of [undefined, "", "   "]) {
    const h = harness({ botUrl });
    assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
    assert.equal(h.calls.length, 0);
    assert.equal(h.lookups(), 0);
  }
});

test("only https URLs are accepted", () => {
  assert.equal(websiteBotUrl("http://www.ritumbhara.com/api/whatsapp/inbound"), null);
  assert.equal(websiteBotUrl("not a url"), null);
  assert.equal(websiteBotUrl(" " + BOT_URL + " "), BOT_URL);
});

// ---------- staff and guests are never forwarded ----------

test("known guest or team member: not forwarded (OS AI keeps handling them)", async () => {
  const h = harness({ isKnownContact: async () => true });
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
  assert.equal(h.calls.length, 0);
});

test("isKnownPhone matches guests and team members in any stored format", () => {
  const phones = { guestPhones: ["98765 43210", null], teamPhones: ["+91-91234-56789", undefined] };
  assert.equal(isKnownPhone("+919876543210", phones), true); // guest stored without country code
  assert.equal(isKnownPhone("+919123456789", phones), true); // team member with dashes
  assert.equal(isKnownPhone("+919000000001", phones), false); // unknown -> website lead
  assert.equal(isKnownPhone("", phones), false);
});

test("contact lookup failure falls back to the normal OS flow", async () => {
  const h = harness({ isKnownContact: async () => { throw new Error("db down"); } });
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.events, ["contact_lookup_failed"]);
});

// ---------- forwarding ----------

test("unknown sender: forwards the exact raw body and Twilio signature, returns the bot's TwiML", async () => {
  const h = harness();
  const out = await routeToWebsiteLeadBot(INPUT, h.deps);
  assert.equal(out, TWIML);
  assert.equal(h.calls.length, 1);
  const { url, init } = h.calls[0];
  assert.equal(url, BOT_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.body, RAW_BODY); // byte-identical, so the Twilio signature still verifies
  const headers = init.headers as Record<string, string>;
  assert.equal(headers["X-Twilio-Signature"], INPUT.signature);
  assert.equal(headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(init.redirect, "manual");
  assert.ok(init.signal);
});

test("bot reply is logged as OUTBOUND text for the dashboard inbox (XML unescaped)", async () => {
  const h = harness();
  await routeToWebsiteLeadBot(INPUT, h.deps);
  assert.deepEqual(h.logged, [{ to: "+919000000001", text: "Hi! When would you like to check in? (e.g. 12 Dec) & how many guests?" }]);
  assert.equal(WEBSITE_LEAD_BOT_ENTITY, "WEBSITE_LEAD_BOT");
});

test("empty TwiML (bot silent: handed off, opted out, or bot disabled) is returned as-is and nothing is logged", async () => {
  const empty = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const h = harness({ response: () => xmlResponse(empty) });
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), empty);
  assert.equal(h.logged.length, 0);
});

test("missing X-Twilio-Signature: not forwarded", async () => {
  const h = harness();
  assert.equal(await routeToWebsiteLeadBot({ ...INPUT, signature: null }, h.deps), null);
  assert.equal(h.calls.length, 0);
});

// ---------- failures fall back to the normal OS flow ----------

test("website errors (403 bad signature, 500, 503 misconfigured) -> null", async () => {
  for (const status of [403, 413, 500, 503]) {
    const h = harness({ response: () => new Response(null, { status }) });
    assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null, String(status));
    assert.deepEqual(h.events, ["bot_rejected"]);
  }
});

test("redirect (e.g. apex domain -> www) is not followed -> null", async () => {
  const h = harness({ response: () => new Response(null, { status: 308, headers: { Location: BOT_URL } }) });
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
});

test("non-XML 200 (e.g. an HTML login/protection page) -> null", async () => {
  const h = harness({ response: () => new Response("<html>Authentication Required</html>", { status: 200, headers: { "Content-Type": "text/html" } }) });
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
});

test("XML without <Response> or an oversized reply -> null", async () => {
  for (const body of ["<?xml version=\"1.0\"?><Other/>", "<Response>" + "x".repeat(70 * 1024) + "</Response>"]) {
    const h = harness({ response: () => xmlResponse(body) });
    assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
    assert.deepEqual(h.events, ["bot_bad_reply"]);
  }
});

test("network error -> null", async () => {
  const h = harness({ fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
  assert.deepEqual(h.events, ["bot_unreachable"]);
});

test("timeout aborts the request and returns null within the limit", async () => {
  const slow = (async (_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as typeof fetch;
  const h = harness({ fetchImpl: slow, timeoutMs: 50 });
  const started = Date.now();
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), null);
  assert.ok(Date.now() - started < 1000);
});

test("a logging failure never blocks the guest's reply", async () => {
  const h = harness({ logOutbound: async () => { throw new Error("db write failed"); } });
  assert.equal(await routeToWebsiteLeadBot(INPUT, h.deps), TWIML);
  assert.ok(h.events.includes("outbound_log_failed"));
});

test("logs never contain the full phone number or message text", async () => {
  const lines: string[] = [];
  const h = harness({ log: (event, meta) => { lines.push(event + JSON.stringify(meta || {})); } });
  await routeToWebsiteLeadBot(INPUT, h.deps);
  const all = lines.join("\n");
  assert.match(all, /\*\*\*0001/);
  assert.doesNotMatch(all, /919000000001|check availability|W-FLOATING/);
});

test("twimlMessageTexts handles several messages, attributes and entities", () => {
  const xml = '<Response><Message>One &lt;b&gt;</Message><Message to="x">Two &quot;q&quot; &apos;s&apos;</Message><Message>  </Message></Response>';
  assert.deepEqual(twimlMessageTexts(xml), ["One <b>", "Two \"q\" 's'"]);
});
