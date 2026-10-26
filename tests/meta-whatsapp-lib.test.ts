// Meta WhatsApp (alongside Twilio): signature, parsing, templates, sending, provider selection, routers, pipeline,
// and proof that the Twilio sender is still used by default. No network, no real credentials.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

const logged: Record<string, unknown>[] = [];
const twilioCalls: Record<string, unknown>[] = [];
mock.module(mod("lib/prisma.ts"), {
  namedExports: {
    prisma: {
      whatsAppMessage: { create: async (args: { data: Record<string, unknown> }) => { logged.push(args.data); return {}; } },
      guest: { findMany: async () => [] },
      teamMember: { findMany: async () => [] },
    },
  },
});
mock.module("twilio", {
  defaultExport: Object.assign(() => ({ messages: { create: async (p: Record<string, unknown>) => { twilioCalls.push(p); return { sid: "SM1" }; } } }), {
    validateRequest: () => true,
  }),
});

let verifyMetaSignature: any, computeMetaSignature: any, parseMetaWebhook: any, metaTemplateFor: any, orderedParams: any, OS_TEMPLATE_DEFAULTS: any, sendMetaText: any, sendMetaTemplate: any, resolveWhatsAppProvider: any, runWithWhatsAppProvider: any, getMetaSendConfig: any, getMetaWebhookConfig: any, askGuestMessagesForMeta: any, forwardToWebsiteLeadBotForMeta: any, signLeadBotRequest: any, processMetaInbound: any, sendWhatsAppMessage: any, fetchMetaMedia: any;
before(async () => {
  ({ verifyMetaSignature, computeMetaSignature } = await import(mod("lib/whatsapp/meta/signature.ts")));
  ({ parseMetaWebhook } = await import(mod("lib/whatsapp/meta/parse.ts")));
  ({ metaTemplateFor, orderedParams, OS_TEMPLATE_DEFAULTS } = await import(mod("lib/whatsapp/meta/templates.ts")));
  ({ sendMetaText, sendMetaTemplate } = await import(mod("lib/whatsapp/meta/send.ts")));
  ({ resolveWhatsAppProvider, runWithWhatsAppProvider, getMetaSendConfig, getMetaWebhookConfig } = await import(mod("lib/whatsapp/meta/config.ts")));
  ({ askGuestMessagesForMeta, forwardToWebsiteLeadBotForMeta, signLeadBotRequest } = await import(mod("lib/whatsapp/meta/routers.ts")));
  ({ processMetaInbound } = await import(mod("lib/whatsapp/meta/pipeline.ts")));
  ({ sendWhatsAppMessage } = await import(mod("lib/whatsapp/client.ts")));
  ({ fetchMetaMedia } = await import(mod("lib/whatsapp/meta/media.ts")));
});

const SECRET = "app_secret_for_tests_only_0123456789";
const CFG = { accessToken: "test-token", phoneNumberId: "1234567890", graphApiVersion: "v23.0", displayNumber: "+15550001111" };

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  return fn().finally(() => { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}

function fakeFetch(responses: { status: number; body: unknown }[], calls: { url: string; init: RequestInit }[]) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() || { status: 200, body: { messages: [{ id: "wamid.OUT" }] } };
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

// ---------- signature ----------
test("signature: valid HMAC-SHA256 accepted; tampered body, wrong secret, missing/malformed header rejected", () => {
  const body = '{"object":"whatsapp_business_account"}';
  const sig = computeMetaSignature(SECRET, body);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  assert.equal(verifyMetaSignature(SECRET, body, sig), true);
  assert.equal(verifyMetaSignature(SECRET, body + " ", sig), false);
  assert.equal(verifyMetaSignature("other_secret_000000000000", body, sig), false);
  assert.equal(verifyMetaSignature(SECRET, body, null), false);
  assert.equal(verifyMetaSignature(SECRET, body, "sha1=abc"), false);
});

// ---------- parsing ----------
function webhook(messages: unknown[], extra: Record<string, unknown> = {}, phoneNumberId = "1234567890") {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: Object.assign({ messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId, display_phone_number: "15550001111" }, contacts: [{ wa_id: "919000000001", profile: { name: "Test Guest" } }], messages }, extra) }] }],
  };
}

test("parse: text, quick-reply button, interactive reply and image caption; sender becomes +<digits>", () => {
  const out = parseMetaWebhook(webhook([
    { from: "919000000001", id: "wamid.A", timestamp: "1700000000", type: "text", text: { body: "  Hi there " } },
    { from: "919000000001", id: "wamid.B", type: "button", button: { text: "ACCEPT", payload: "p" } },
    { from: "919000000001", id: "wamid.C", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title: "Yes" } } },
    { from: "919000000001", id: "wamid.D", type: "image", image: { id: "555666777", caption: "RESOLVE done", mime_type: "image/jpeg" } },
  ]), "1234567890");
  assert.deepEqual(out.map((m: { text: string }) => m.text), ["Hi there", "ACCEPT", "Yes", "RESOLVE done"]);
  assert.equal(out[0].senderPhone, "+919000000001");
  assert.equal(out[0].profileName, "Test Guest");
  assert.equal(out[3].mediaId, "555666777");
});

test("parse: delivery statuses, other fields, other phone numbers and non-WhatsApp objects are ignored", () => {
  assert.deepEqual(parseMetaWebhook(webhook([], { statuses: [{ id: "wamid.S", status: "delivered" }] })), []);
  assert.deepEqual(parseMetaWebhook(webhook([{ from: "919000000001", id: "wamid.X", type: "text", text: { body: "hi" } }], {}, "999"), "1234567890"), []);
  assert.deepEqual(parseMetaWebhook({ object: "page", entry: [] }), []);
  assert.deepEqual(parseMetaWebhook(null), []);
});

// ---------- templates ----------
test("templates: every OS template maps to a Meta template; _v2 aliases share one; OTP is an authentication template", () => {
  for (const name of Object.keys(OS_TEMPLATE_DEFAULTS)) assert.ok(metaTemplateFor(name, {}), name);
  assert.equal(metaTemplateFor("booking_confirmation_v2", {}).name, "booking_confirmation");
  assert.equal(metaTemplateFor("long_stay_otp", {}).kind, "authentication");
  assert.equal(metaTemplateFor("unknown_template", {}), null);
  assert.deepEqual(metaTemplateFor("ticket_assigned", { META_WA_TEMPLATE_LANGUAGE: "en_US" }), { name: "ticket_assigned", language: "en_US", kind: "standard" });
  assert.equal(metaTemplateFor("ticket_assigned", { META_WA_TEMPLATES: '{"ticket_assigned":{"name":"ticket_assigned_v3","language":"hi"}}' }).name, "ticket_assigned_v3");
  assert.deepEqual(orderedParams({ "2": "b", "1": "a", "10": "j", x: "ignored", "3": "" }), ["a", "b", "-", "j"]);
});

// ---------- sending ----------
test("send: text and template payloads match the Graph API; token sent as Bearer; no Twilio involved", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = fakeFetch([], calls);
  assert.deepEqual(await sendMetaText(CFG, "+91 90000 00001", "Hello", { fetchImpl: f }), { ok: true, id: "wamid.OUT" });
  assert.deepEqual(await sendMetaTemplate(CFG, "+919000000001", { name: "ticket_resolved", language: "en", kind: "standard" }, ["Asha", "Towels"], { fetchImpl: f }), { ok: true, id: "wamid.OUT" });
  await sendMetaTemplate(CFG, "+919000000001", { name: "long_stay_otp", language: "en", kind: "authentication" }, ["123456"], { fetchImpl: f });
  assert.equal(calls[0].url, "https://graph.facebook.com/v23.0/1234567890/messages");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { messaging_product: "whatsapp", recipient_type: "individual", to: "919000000001", type: "text", text: { preview_url: false, body: "Hello" } });
  assert.deepEqual(JSON.parse(String(calls[1].init.body)).template, { name: "ticket_resolved", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "Asha" }, { type: "text", text: "Towels" }] }] });
  assert.equal(JSON.parse(String(calls[2].init.body)).template.components[1].sub_type, "url");
});

test("send: Meta errors become short reasons (no message text); bad numbers are refused before any request", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const r = await sendMetaText(CFG, "+919000000001", "x", { fetchImpl: fakeFetch([{ status: 400, body: { error: { code: 131047, message: "Re-engagement message +919000000001" } } }], calls) });
  assert.deepEqual(r, { ok: false, reason: "http_400", status: 400, code: 131047 });
  assert.deepEqual(await sendMetaText(CFG, "abc", "x", { fetchImpl: fakeFetch([], calls) }), { ok: false, reason: "invalid_input" });
  assert.equal(calls.length, 1);
});

// ---------- config / provider ----------
test("provider: Twilio by default; WHATSAPP_PROVIDER=meta switches; a request context overrides the env both ways", async () => {
  assert.equal(resolveWhatsAppProvider({}), "twilio");
  assert.equal(resolveWhatsAppProvider({ WHATSAPP_PROVIDER: "twilio" }), "twilio");
  assert.equal(resolveWhatsAppProvider({ WHATSAPP_PROVIDER: "something" }), "twilio");
  assert.equal(resolveWhatsAppProvider({ WHATSAPP_PROVIDER: " META " }), "meta");
  assert.equal(await runWithWhatsAppProvider("meta", async () => resolveWhatsAppProvider({})), "meta");
  assert.equal(await runWithWhatsAppProvider("twilio", async () => resolveWhatsAppProvider({ WHATSAPP_PROVIDER: "meta" })), "twilio");
  assert.equal(resolveWhatsAppProvider({}), "twilio"); // context does not leak
});

test("config: missing Meta settings are reported by name only; webhook config fails closed", () => {
  const r = getMetaSendConfig({});
  assert.equal(r.ok, false);
  assert.deepEqual((r as { missing: string[] }).missing, ["META_WA_ACCESS_TOKEN", "META_WA_PHONE_NUMBER_ID"]);
  assert.equal(getMetaSendConfig({ META_WA_ACCESS_TOKEN: "t", META_WA_PHONE_NUMBER_ID: "1234567890", META_GRAPH_API_VERSION: "bad" }).config.graphApiVersion, "v23.0");
  assert.equal(getMetaWebhookConfig({}), null);
  assert.equal(getMetaWebhookConfig({ META_APP_SECRET: "short", META_WEBHOOK_VERIFY_TOKEN: "x".repeat(20) }), null);
  assert.ok(getMetaWebhookConfig({ META_APP_SECRET: "s".repeat(32), META_WEBHOOK_VERIFY_TOKEN: "v".repeat(20) }));
});

// ---------- the existing sender: Twilio unchanged by default, Meta only in context ----------
test("client.sendWhatsAppMessage: no context + no WHATSAPP_PROVIDER -> the Twilio path runs exactly as before", async () => {
  twilioCalls.length = 0; logged.length = 0;
  await withEnv({ WHATSAPP_PROVIDER: undefined, TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tok", TWILIO_WHATSAPP_NUMBER: "+918306312778" }, async () => {
    const r = await sendWhatsAppMessage("+919000000001", "template", "Hi", "booking_confirmation", "Reservation", "r1", { "1": "Asha" });
    assert.deepEqual(r, { success: true, status: "DELIVERED" });
  });
  assert.equal(twilioCalls.length, 1);
  assert.equal(twilioCalls[0].contentSid, "HX9efde0bf3a839c4264a6eae0a41740dd");
  assert.equal(twilioCalls[0].from, "whatsapp:+918306312778");
  assert.equal(logged[0].from, "+918306312778");
});

test("client.sendWhatsAppMessage: inside a Meta conversation it sends through Meta, never Twilio", async () => {
  twilioCalls.length = 0; logged.length = 0;
  const calls: { url: string; init: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch([], calls);
  try {
    await withEnv({ WHATSAPP_PROVIDER: undefined, TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tok", TWILIO_WHATSAPP_NUMBER: "+918306312778", META_WA_ACCESS_TOKEN: "t", META_WA_PHONE_NUMBER_ID: "1234567890", META_WA_DISPLAY_NUMBER: "+15550001111" }, async () => {
      const r = await runWithWhatsAppProvider("meta", () => sendWhatsAppMessage("+919000000001", "template", "Hi", "post_stay_thank_you", "Reservation", "r1", { "1": "Asha" }));
      assert.deepEqual(r, { success: true, status: "DELIVERED" });
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(twilioCalls.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(String(calls[0].init.body)).template.name, "post_stay_thank_you");
  assert.equal(logged[0].from, "+15550001111");
  assert.equal(logged[0].status, "DELIVERED");
});

test("client.sendWhatsAppMessage: Meta selected but not configured -> FAILED (no silent sandbox success)", async () => {
  twilioCalls.length = 0; logged.length = 0;
  await withEnv({ META_WA_ACCESS_TOKEN: undefined, META_WA_PHONE_NUMBER_ID: undefined }, async () => {
    const r = await runWithWhatsAppProvider("meta", () => sendWhatsAppMessage("+919000000001", "text", "Hi"));
    assert.deepEqual(r, { success: false, status: "FAILED" });
  });
  assert.equal(twilioCalls.length, 0);
  assert.equal(logged[0].status, "FAILED");
});

// ---------- media ----------
test("media: id resolved, downloaded with the token and stored; failures keep a meta-media:<id> reference", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const stored: string[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/555666777")) return new Response(JSON.stringify({ url: "https://lookaside.example/abc", mime_type: "image/jpeg", file_size: 3 }), { status: 200 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as unknown as typeof fetch;
  const url = await fetchMetaMedia(CFG, "555666777", { fetchImpl: f, store: async (p: string) => { stored.push(p); return "https://blob.example/" + p; } });
  assert.equal(url, "https://blob.example/whatsapp-media/555666777.jpeg");
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, "Bearer test-token");
  const failed = await fetchMetaMedia(CFG, "555666777", { fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch, store: async () => "x" });
  assert.equal(failed, "meta-media:555666777");
  assert.equal(await fetchMetaMedia(CFG, null), null);
});

// ---------- routers ----------
const LONG_SECRET = "s".repeat(40);

test("guest messages (Meta): unknown sender's stay question gets the verified website reply; others fall through", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const deps = (known: boolean, body: unknown) => ({ askUrl: "https://www.ritumbhara.com/api/guest-messages/ask", apiSecret: LONG_SECRET, isKnownContact: async () => known, fetchImpl: fakeFetch([{ status: 200, body }], calls), log: () => {} });
  const ok = { ok: true, outcome: "answered", bookingVerified: true, reply: "Yes, late checkout until 1 pm is fine." };
  const input = { senderPhone: "+919000000001", text: "Can I get a late checkout?", messageId: "wamid.HBgM=" };
  assert.equal(await askGuestMessagesForMeta(input, deps(false, ok)), ok.reply);
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(sent.requireBooking, true);
  assert.equal(sent.phone, "+919000000001");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer " + LONG_SECRET);
  assert.equal(await askGuestMessagesForMeta(input, deps(true, ok)), null); // known guest/staff: OS flow
  assert.equal(await askGuestMessagesForMeta({ ...input, text: "Do you have rooms in Jaipur?" }, deps(false, ok)), null); // not a stay topic
  assert.equal(await askGuestMessagesForMeta(input, deps(false, { ok: true, outcome: "not_guest" })), null);
  assert.equal(await askGuestMessagesForMeta(input, deps(false, { ...ok, bookingVerified: false })), null);
  assert.equal(await askGuestMessagesForMeta(input, { ...deps(false, ok), apiSecret: "short" }), null);
});

test("lead bot (Meta): signed JSON request to the website; replies returned; known contacts and failures fall through", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const deps = (known: boolean, responses: { status: number; body: unknown }[]) => ({ botUrl: "https://www.ritumbhara.com/api/whatsapp/lead-bot", secret: LONG_SECRET, isKnownContact: async () => known, fetchImpl: fakeFetch(responses, calls), now: () => 1700000000000, log: () => {} });
  const input = { senderPhone: "+919000000001", text: "Hi", messageId: "wamid.A", profileName: "Asha" };
  assert.deepEqual(await forwardToWebsiteLeadBotForMeta(input, deps(false, [{ status: 200, body: { ok: true, replies: ["When would you like to check in?"] } }])), ["When would you like to check in?"]);
  const body = String(calls[0].init.body);
  assert.equal((calls[0].init.headers as Record<string, string>)["X-Ritumbhara-Signature"], "t=1700000000,v1=" + createHmac("sha256", LONG_SECRET).update("1700000000." + body).digest("hex"));
  assert.equal(signLeadBotRequest(LONG_SECRET, body, 1700000000), (calls[0].init.headers as Record<string, string>)["X-Ritumbhara-Signature"]);
  assert.deepEqual(JSON.parse(body), { messageId: "wamid.A", from: "+919000000001", text: "Hi", numMedia: 0, profileName: "Asha" });
  assert.deepEqual(await forwardToWebsiteLeadBotForMeta(input, deps(false, [{ status: 200, body: { ok: true, replies: [] } }])), []);
  assert.equal(await forwardToWebsiteLeadBotForMeta(input, deps(true, [])), null);
  assert.equal(await forwardToWebsiteLeadBotForMeta(input, deps(false, [{ status: 404, body: {} }])), null);
  assert.equal(await forwardToWebsiteLeadBotForMeta(input, { ...deps(false, []), botUrl: undefined }), null);
});

// ---------- pipeline (same order as the Twilio webhook) ----------
function pipelineDeps(over: Record<string, unknown> = {}) {
  const trace: string[] = [];
  const sent: { to: string; text: string; entity?: string; provider: string }[] = [];
  const deps = Object.assign({
    logInbound: async () => { trace.push("inbound"); },
    resolveMedia: async (id: string | null) => (id ? "https://blob/" + id : null),
    staffAction: async () => { trace.push("staff"); return null; },
    guestMessages: async () => { trace.push("guest"); return null; },
    leadBot: async () => { trace.push("lead"); return null; },
    guestAI: async () => { trace.push("ai"); },
    send: async (to: string, text: string, entity?: string) => { sent.push({ to, text, entity, provider: resolveWhatsAppProvider({}) }); return true; },
    log: () => {},
  }, over);
  return { deps, trace, sent };
}
const MSG = { id: "wamid.P", phoneNumberId: "1234567890", senderPhone: "+919000000001", text: "Hello", type: "text", mediaId: null, profileName: null, timestamp: 0 };

test("pipeline: staff reply short-circuits; replies go out in the Meta context; command is upper-cased", async () => {
  let gotText = "";
  const { deps, trace, sent } = pipelineDeps({ staffAction: async (_p: string, t: string) => { gotText = t; return "✅ Ticket Acknowledged!"; } });
  assert.equal(await processMetaInbound({ ...MSG, text: "accept" }, deps), "staff");
  assert.equal(gotText, "ACCEPT");
  assert.deepEqual(trace, ["inbound"]);
  assert.deepEqual(sent, [{ to: "+919000000001", text: "✅ Ticket Acknowledged!", entity: undefined, provider: "meta" }]);
});

test("pipeline: guest messages -> lead bot -> guest AI, in that order", async () => {
  let p = pipelineDeps({ guestMessages: async () => "Passed to our team." });
  assert.equal(await processMetaInbound(MSG, p.deps), "guest_messages");
  assert.equal(p.sent[0].entity, "GUEST_MESSAGES");
  p = pipelineDeps({ leadBot: async () => ["Q1", "Q2"] });
  assert.equal(await processMetaInbound(MSG, p.deps), "lead_bot");
  assert.deepEqual(p.sent.map((s) => [s.text, s.entity]), [["Q1", "WEBSITE_LEAD_BOT"], ["Q2", "WEBSITE_LEAD_BOT"]]);
  p = pipelineDeps();
  assert.equal(await processMetaInbound(MSG, p.deps), "guest_ai");
  assert.deepEqual(p.trace, ["inbound", "staff", "guest", "lead", "ai"]);
});

test("pipeline: staff photo without caption reaches the staff handler with the stored media URL; otherwise ignored", async () => {
  let media: string | null = null;
  let p = pipelineDeps({ staffAction: async (_p: string, _t: string, m: string | null) => { media = m; return "🎉 resolved with photo evidence"; } });
  assert.equal(await processMetaInbound({ ...MSG, text: "", type: "image", mediaId: "777" }, p.deps), "staff");
  assert.equal(media, "https://blob/777");
  p = pipelineDeps();
  assert.equal(await processMetaInbound({ ...MSG, text: "", type: "image", mediaId: "777" }, p.deps), "media_ignored");
  assert.deepEqual(p.trace, ["inbound", "staff"]);
});
