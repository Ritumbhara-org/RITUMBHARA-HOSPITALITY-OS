// Meta WhatsApp phase 2: messaging_account_id, delivery-status webhooks, 24-hour window, provider-aware system number.
// No network, no real credentials.
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

const logged: Record<string, unknown>[] = [];
mock.module(mod("lib/prisma.ts"), {
  namedExports: { prisma: { whatsAppMessage: { create: async (a: { data: Record<string, unknown> }) => { logged.push(a.data); return {}; }, findFirst: async () => null, updateMany: async () => ({ count: 0 }) } } },
});

const deferred: (() => Promise<void>)[] = [];
mock.module("next/server", {
  namedExports: { NextResponse: { json: (b: unknown, i?: ResponseInit) => Response.json(b, i) }, after: (fn: () => Promise<void>) => { deferred.push(fn); } },
});
const statusUpdates: { id: string; next: string }[] = [];
mock.module(mod("lib/whatsapp/meta/pipeline.ts"), {
  namedExports: { defaultPipelineDeps: () => ({}), processMetaInbound: async () => "guest_ai" },
});
mock.module(mod("lib/whatsapp/meta/statuses.ts"), {
  namedExports: { applyMetaStatuses: async (evs: { id: string; status: string }[]) => { for (const e of evs) statusUpdates.push({ id: e.id, next: e.status }); return { received: evs.length, updated: evs.length, failed: 0 }; } },
});

let parseMetaStatuses: any, isCustomerServiceWindowOpen: any, sendMetaText: any, sendMetaTemplate: any;
let getMetaSendConfig: any, systemWhatsAppNumber: any, allSystemWhatsAppNumbers: any, runWithWhatsAppProvider: any, sendWhatsAppMessageViaMeta: any, sendLongStayWhatsAppViaMeta: any;
let POST: any;
const SECRET = "app_secret_for_tests_only_0123456789";
process.env.META_APP_SECRET = SECRET;
process.env.META_WEBHOOK_VERIFY_TOKEN = "verify_token_for_tests_123";
process.env.META_WA_ACCESS_TOKEN = "t";
process.env.META_WA_PHONE_NUMBER_ID = "1234567890";

before(async () => {
  ({ parseMetaStatuses } = await import(mod("lib/whatsapp/meta/parse.ts")));
  ({ isCustomerServiceWindowOpen } = await import(mod("lib/whatsapp/meta/window.ts")));
  ({ sendMetaText, sendMetaTemplate } = await import(mod("lib/whatsapp/meta/send.ts")));
  ({ getMetaSendConfig, systemWhatsAppNumber, allSystemWhatsAppNumbers, runWithWhatsAppProvider } = await import(mod("lib/whatsapp/meta/config.ts")));
  ({ sendWhatsAppMessageViaMeta, sendLongStayWhatsAppViaMeta } = await import(mod("lib/whatsapp/meta/outbound.ts")));
  ({ POST } = await import(mod("app/api/whatsapp/meta-webhook/route.ts")));
});

const statusBody = (statuses: unknown[], pnid = "1234567890") =>
  JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: pnid }, statuses } }] }] });

// ---- config
test("messaging_account_id: read from env, only digits, included in the send config", () => {
  const base = { META_WA_ACCESS_TOKEN: "t", META_WA_PHONE_NUMBER_ID: "1234567890" };
  assert.equal(getMetaSendConfig({ ...base, META_WA_MESSAGING_ACCOUNT_ID: "2237581420138705" }).config.messagingAccountId, "2237581420138705");
  assert.equal(getMetaSendConfig({ ...base }).config.messagingAccountId, "");
  assert.equal(getMetaSendConfig({ ...base, META_WA_MESSAGING_ACCOUNT_ID: "abc" }).config.messagingAccountId, "");
});

test("sends carry messaging_account_id only when configured", async () => {
  const bodies: Record<string, unknown>[] = [];
  const f = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }); }) as unknown as typeof fetch;
  const cfg = { accessToken: "t", phoneNumberId: "1234567890", graphApiVersion: "v23.0", displayNumber: "+1555", messagingAccountId: "2237581420138705" };
  await sendMetaText(cfg, "+919000000001", "hi", { fetchImpl: f });
  await sendMetaTemplate({ ...cfg, messagingAccountId: "" }, "+919000000001", { name: "x", language: "en", kind: "utility" } as never, [], { fetchImpl: f });
  assert.equal(bodies[0].messaging_account_id, "2237581420138705");
  assert.equal(bodies[0].messaging_product, "whatsapp");
  assert.equal("messaging_account_id" in bodies[1], false);
});

// ---- system number
test("system number is provider-aware; Meta placeholder is not a number", async () => {
  const env = { TWILIO_WHATSAPP_NUMBER: "+918306312778", META_WA_DISPLAY_NUMBER: "+15551422953" };
  assert.equal(systemWhatsAppNumber({ ...env }), "+918306312778"); // default provider = twilio
  assert.equal(systemWhatsAppNumber({ ...env, WHATSAPP_PROVIDER: "meta" }), "+15551422953");
  assert.equal(systemWhatsAppNumber({ WHATSAPP_PROVIDER: "meta" }), "");
  assert.equal(systemWhatsAppNumber({ WHATSAPP_PROVIDER: "meta", META_WA_DISPLAY_NUMBER: "META" }), "");
  assert.deepEqual(allSystemWhatsAppNumbers({ ...env }).sort(), ["+15551422953", "+918306312778"]);
  await runWithWhatsAppProvider("meta", async () => { /* context overrides env */ });
});

// ---- status parsing
test("parseMetaStatuses: keeps sent/delivered/read/failed for our number only", () => {
  const body = statusBody([
    { id: "wamid.1", status: "sent", recipient_id: "919000000001", timestamp: "1" },
    { id: "wamid.2", status: "failed", recipient_id: "919000000001", timestamp: "2", errors: [{ code: 131047, title: "Re-engagement message" }] },
    { id: "wamid.3", status: "bogus" },
    { status: "read" },
  ]);
  const r = parseMetaStatuses(JSON.parse(body), "1234567890");
  assert.deepEqual(r.map((e: any) => [e.id, e.status, e.errorCode]), [["wamid.1", "sent", null], ["wamid.2", "failed", 131047]]);
  assert.equal(parseMetaStatuses(JSON.parse(statusBody([{ id: "w", status: "sent" }], "999999")), "1234567890").length, 0);
  assert.equal(parseMetaStatuses({ object: "page" }).length, 0);
});

test("route: status events are processed after the response; bad signature is still 401", async () => {
  const URL_ = "https://os.example.com/api/whatsapp/meta-webhook";
  const body = statusBody([{ id: "wamid.9", status: "delivered", recipient_id: "919000000001" }]);
  const sig = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
  statusUpdates.length = 0;
  const res = await POST(new Request(URL_, { method: "POST", body, headers: { "X-Hub-Signature-256": sig } }));
  assert.equal(res.status, 200);
  while (deferred.length) await deferred.shift()!();
  assert.deepEqual(statusUpdates, [{ id: "wamid.9", next: "delivered" }]);
  statusUpdates.length = 0;
  assert.equal((await POST(new Request(URL_, { method: "POST", body, headers: { "X-Hub-Signature-256": "sha256=00" } }))).status, 401);
  assert.equal(statusUpdates.length, 0);
});

// ---- 24h window
test("window: open within 24h, closed after, closed when never written, fails closed on error", async () => {
  const now = Date.UTC(2026, 10, 24, 12, 0, 0);
  const at = (h: number) => async () => new Date(now - h * 36e5);
  assert.equal(await isCustomerServiceWindowOpen("+919000000001", { lastInboundAt: at(1), now: () => now }), true);
  assert.equal(await isCustomerServiceWindowOpen("+919000000001", { lastInboundAt: at(23.9), now: () => now }), true);
  assert.equal(await isCustomerServiceWindowOpen("+919000000001", { lastInboundAt: at(24), now: () => now }), false);
  assert.equal(await isCustomerServiceWindowOpen("+919000000001", { lastInboundAt: at(30), now: () => now }), false);
  assert.equal(await isCustomerServiceWindowOpen("+919000000001", { lastInboundAt: async () => null, now: () => now }), false);
  assert.equal(await isCustomerServiceWindowOpen("+919000000001", { lastInboundAt: async () => { throw new Error("db"); }, now: () => now }), false);
  assert.equal(await isCustomerServiceWindowOpen("", { lastInboundAt: at(1), now: () => now }), false);
});

const sendOk = { text: async () => ({ ok: true as const, id: "wamid.T" }), template: async () => ({ ok: true as const, id: "wamid.TPL" }) };

test("outbound: text outside the window is NOT sent and is logged FAILED with WINDOW_CLOSED returned", async () => {
  process.env.META_WA_ACCESS_TOKEN = "t"; process.env.META_WA_PHONE_NUMBER_ID = "1234567890";
  const rows: Record<string, unknown>[] = [];
  let textCalls = 0;
  const r = await sendWhatsAppMessageViaMeta("+919000000001", "text", "hello", undefined, "MANUAL_REPLY", "INBOX", undefined, {
    send: { text: async () => { textCalls++; return { ok: true as const, id: "x" }; }, template: sendOk.template } as never,
    log: async (d: Record<string, unknown>) => { rows.push(d); }, windowOpen: async () => false,
  });
  assert.deepEqual(r, { success: false, status: "WINDOW_CLOSED" });
  assert.equal(textCalls, 0);
  assert.equal(rows[0].status, "FAILED");
  assert.equal("providerMessageId" in rows[0], false);
});

test("outbound: text inside the window is sent, logged SENT with the wamid", async () => {
  const rows: Record<string, unknown>[] = [];
  const r = await sendWhatsAppMessageViaMeta("+919000000001", "text", "hello", undefined, undefined, undefined, undefined, { send: sendOk as never, log: async (d: Record<string, unknown>) => { rows.push(d); }, windowOpen: async () => true });
  assert.deepEqual(r, { success: true, status: "SENT" });
  assert.equal(rows[0].status, "SENT");
  assert.equal(rows[0].providerMessageId, "wamid.T");
});

test("outbound: an approved template is sent even when the window is closed", async () => {
  const rows: Record<string, unknown>[] = [];
  let windowAsked = false;
  const r = await sendWhatsAppMessageViaMeta("+919000000001", "template", "c", "booking_confirmation", "RESERVATION", "r1", { "1": "A" }, {
    send: sendOk as never, log: async (d: Record<string, unknown>) => { rows.push(d); }, windowOpen: async () => { windowAsked = true; return false; },
  });
  assert.equal(r.success, true);
  assert.equal(rows[0].providerMessageId, "wamid.TPL");
  assert.equal(windowAsked, false);
});

test("long-stay: no plain-text fallback outside the window when the template fails", async () => {
  const rows: Record<string, unknown>[] = [];
  let textCalls = 0;
  const failTpl = { ok: false as const, reason: "http_400", status: 400 };
  const r = await sendLongStayWhatsAppViaMeta({ to: "+919000000001", kind: "SIGN_LINK", body: "b", variables: {}, bookingId: "b1" }, {
    send: { template: async () => failTpl, text: async () => { textCalls++; return { ok: true as const, id: "x" }; } } as never,
    log: async (d: Record<string, unknown>) => { rows.push(d); }, windowOpen: async () => false,
  });
  assert.equal(r.ok, false);
  assert.equal(textCalls, 0);
  const r2 = await sendLongStayWhatsAppViaMeta({ to: "+919000000001", kind: "SIGN_LINK", body: "b", variables: {}, bookingId: "b1" }, {
    send: { template: async () => failTpl, text: async () => { textCalls++; return { ok: true as const, id: "wamid.F" }; } } as never,
    log: async (d: Record<string, unknown>) => { rows.push(d); }, windowOpen: async () => true,
  });
  assert.equal(r2.ok, true);
  assert.equal(textCalls, 1);
  assert.equal(rows[1].providerMessageId, "wamid.F");
});
