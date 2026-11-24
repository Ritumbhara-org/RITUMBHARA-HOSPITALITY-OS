// Instagram DMs in the unified inbox: config, webhook parsing, sending, ingest and the webhook route.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

const deferred: (() => Promise<void>)[] = [];
const stored: { mid: string; guestId: string; direction: string; text: string }[] = [];

mock.module("next/server", {
  namedExports: {
    NextResponse: { json: (b: unknown, init?: ResponseInit) => Response.json(b, init) },
    after: (fn: () => Promise<void>) => { deferred.push(fn); },
  },
});
mock.module(mod("lib/instagram/ingest.ts"), {
  namedExports: {
    defaultInstagramIngestDeps: () => ({}),
    ingestInstagramDM: async (m: { mid: string; guestId: string; direction: string; text: string }) => { stored.push(m); return "stored"; },
  },
});

const SECRET = "ig_app_secret_for_tests_0123456789";
const VERIFY = "ig_verify_token_for_tests_123";
const OWN = "17841400000000001";
const GUEST = "998877665544332";

let getInstagramSendConfig: any, getInstagramWebhookConfig: any, parseInstagramWebhook: any, sendInstagramText: any,
  describeInstagramError: any, isPublicPath: any, CHANNELS: any, CHANNEL_ORDER: any, EMAIL_BASED_CHANNELS: any;
before(async () => {
  ({ getInstagramSendConfig, getInstagramWebhookConfig } = await import(mod("lib/instagram/config.ts")));
  ({ parseInstagramWebhook } = await import(mod("lib/instagram/parse.ts")));
  ({ sendInstagramText, describeInstagramError } = await import(mod("lib/instagram/send.ts")));
  ({ isPublicPath } = await import(mod("lib/auth/policy.ts")));
  ({ CHANNELS, CHANNEL_ORDER, EMAIL_BASED_CHANNELS } = await import(mod("lib/inbox/channels.ts")));
});

function delivery(messaging: unknown[], accountId = OWN) {
  return { object: "instagram", entry: [{ id: accountId, time: 1, messaging }] };
}
const textEvent = (mid: string, text: string, opts: Record<string, unknown> = {}) => ({
  sender: { id: GUEST }, recipient: { id: OWN }, timestamp: 1761900000000, message: { mid, text, ...opts },
});

test("config: send settings need token and account id; host and version are sanitised", () => {
  const missing = getInstagramSendConfig({});
  assert.equal(missing.ok, false);
  assert.deepEqual((missing as any).missing, ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_ACCOUNT_ID"]);
  const ok = getInstagramSendConfig({ INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_ACCOUNT_ID: OWN, INSTAGRAM_API_HOST: "https://evil.example.com", INSTAGRAM_API_VERSION: "bad" });
  assert.equal(ok.ok, true);
  assert.equal((ok as any).config.apiHost, "graph.instagram.com");
  assert.equal((ok as any).config.apiVersion, "v23.0");
  const fb = getInstagramSendConfig({ INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_ACCOUNT_ID: OWN, INSTAGRAM_API_HOST: "graph.facebook.com", INSTAGRAM_HUMAN_AGENT: "true" });
  assert.equal((fb as any).config.apiHost, "graph.facebook.com");
  assert.equal((fb as any).config.humanAgent, true);
});

test("config: webhook fails closed and falls back to the Meta app settings", () => {
  assert.equal(getInstagramWebhookConfig({}), null);
  assert.equal(getInstagramWebhookConfig({ INSTAGRAM_APP_SECRET: "short", INSTAGRAM_WEBHOOK_VERIFY_TOKEN: VERIFY }), null);
  assert.deepEqual(getInstagramWebhookConfig({ META_APP_SECRET: SECRET, META_WEBHOOK_VERIFY_TOKEN: VERIFY }), { appSecret: SECRET, verifyToken: VERIFY });
  assert.equal(getInstagramWebhookConfig({ INSTAGRAM_APP_SECRET: SECRET + "x", META_APP_SECRET: SECRET, META_WEBHOOK_VERIFY_TOKEN: VERIFY })!.appSecret, SECRET + "x");
});

test("parse: inbound text, echoes, attachments and story replies; others ignored", () => {
  const dms = parseInstagramWebhook(delivery([
    textEvent("m1", "Is the studio free this weekend?"),
    { sender: { id: OWN }, recipient: { id: GUEST }, timestamp: 1761900001000, message: { mid: "m2", text: "Yes it is!", is_echo: true } },
    { sender: { id: GUEST }, recipient: { id: OWN }, timestamp: 1, message: { mid: "m3", attachments: [{ type: "image", payload: { url: "https://x" } }] } },
    { sender: { id: GUEST }, recipient: { id: OWN }, timestamp: 1, message: { mid: "m4", text: "Love it", reply_to: { story: { id: "s", url: "u" } } } },
    { sender: { id: GUEST }, recipient: { id: OWN }, timestamp: 1, message: { mid: "m5", text: "gone", is_deleted: true } },
    { sender: { id: GUEST }, recipient: { id: OWN }, timestamp: 1, read: { mid: "m1" } },
    { sender: { id: GUEST }, recipient: { id: OWN }, timestamp: 1, reaction: { mid: "m1", action: "react" } },
  ]), OWN);
  assert.deepEqual(dms.map((d: any) => [d.mid, d.direction, d.guestId, d.text]), [
    ["m1", "INBOUND", GUEST, "Is the studio free this weekend?"],
    ["m2", "OUTBOUND", GUEST, "Yes it is!"],
    ["m3", "INBOUND", GUEST, "[Photo]"],
    ["m4", "INBOUND", GUEST, "[Replied to your story] Love it"],
  ]);
  assert.equal(dms[0].at.getTime(), 1761900000000);
});

test("parse: other accounts, other objects and junk give nothing", () => {
  assert.deepEqual(parseInstagramWebhook(delivery([textEvent("m1", "hi")], "123456789"), OWN), []);
  assert.deepEqual(parseInstagramWebhook({ object: "page", entry: [] }, OWN), []);
  assert.deepEqual(parseInstagramWebhook(null, OWN), []);
  assert.deepEqual(parseInstagramWebhook(delivery([textEvent("m1", "hi")]), ""), []);
});

test("send: posts to /me/messages with the token; HUMAN_AGENT tag only when asked", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ recipient_id: GUEST, message_id: "mid.out1" });
  }) as unknown as typeof fetch;
  const cfg = { accessToken: "tok", accountId: OWN, apiHost: "graph.instagram.com", apiVersion: "v23.0", humanAgent: true };
  const r = await sendInstagramText(cfg, GUEST, " Hello! ", false, { fetchImpl });
  assert.deepEqual(r, { ok: true, id: "mid.out1" });
  assert.equal(calls[0].url, "https://graph.instagram.com/v23.0/me/messages");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { recipient: { id: GUEST }, message: { text: "Hello!" } });
  await sendInstagramText(cfg, GUEST, "Late reply", true, { fetchImpl });
  assert.equal(JSON.parse(String(calls[1].init.body)).tag, "HUMAN_AGENT");
});

test("send: bad input, long text and Meta errors come back as plain reasons", async () => {
  const cfg = { accessToken: "tok", accountId: OWN, apiHost: "graph.instagram.com", apiVersion: "v23.0", humanAgent: false };
  assert.equal((await sendInstagramText(cfg, "abc", "hi")).ok, false);
  const long = await sendInstagramText(cfg, GUEST, "x".repeat(1001));
  assert.equal((long as any).reason, "too_long");
  const fetchImpl = (async () => Response.json({ error: { code: 10, message: "outside window" } }, { status: 400 })) as unknown as typeof fetch;
  const err = await sendInstagramText(cfg, GUEST, "hi", false, { fetchImpl });
  assert.deepEqual(err, { ok: false, reason: "http_400", status: 400, code: 10 });
  assert.match(describeInstagramError(err as any), /too old/);
});

test("channels and auth policy know about Instagram", () => {
  assert.equal(CHANNELS.INSTAGRAM.label, "Instagram");
  assert.ok(CHANNEL_ORDER.includes("INSTAGRAM"));
  assert.ok(!EMAIL_BASED_CHANNELS.includes("INSTAGRAM"));
  assert.equal(isPublicPath("/api/instagram/webhook"), true);
});

// ---- webhook route
let GET: any, POST: any;
const URL_ = "https://os.example.com/api/instagram/webhook";
function signed(body: string, secret = SECRET) {
  return new Request(URL_, { method: "POST", body, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=" + createHmac("sha256", secret).update(body).digest("hex") } });
}
async function drain() { while (deferred.length) await deferred.shift()!(); }

before(async () => {
  process.env.INSTAGRAM_APP_SECRET = SECRET;
  process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = VERIFY;
  process.env.INSTAGRAM_ACCOUNT_ID = OWN;
  ({ GET, POST } = await import(mod("app/api/instagram/webhook/route.ts")));
});

test("route GET: handshake echoes the challenge only with the right token", async () => {
  const ok = await GET(new Request(URL_ + "?hub.mode=subscribe&hub.verify_token=" + VERIFY + "&hub.challenge=42"));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "42");
  assert.equal((await GET(new Request(URL_ + "?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42"))).status, 403);
});

test("route POST: signed delivery is stored after the response; bad signature is refused", async () => {
  stored.length = 0;
  const body = JSON.stringify(delivery([textEvent("m10", "Hi, do you allow pets?")]));
  const res = await POST(signed(body));
  assert.equal(res.status, 200);
  assert.equal(stored.length, 0); // nothing before the response
  await drain();
  assert.deepEqual(stored.map((s) => [s.mid, s.text]), [["m10", "Hi, do you allow pets?"]]);

  const bad = await POST(signed(body, "wrong_secret_wrong_secret_123456"));
  assert.equal(bad.status, 401);
  const unsigned = await POST(new Request(URL_, { method: "POST", body }));
  assert.equal(unsigned.status, 401);
});

test("route POST: messages for another account are not stored", async () => {
  stored.length = 0;
  const res = await POST(signed(JSON.stringify(delivery([textEvent("m11", "hi")], "5555555555"))));
  assert.equal(res.status, 200);
  await drain();
  assert.equal(stored.length, 0);
});

test("route POST: refuses everything when not configured", async () => {
  const saved = { a: process.env.INSTAGRAM_APP_SECRET, m: process.env.META_APP_SECRET };
  delete process.env.INSTAGRAM_APP_SECRET;
  delete process.env.META_APP_SECRET;
  try {
    const res = await POST(signed(JSON.stringify(delivery([textEvent("m12", "hi")]))));
    assert.equal(res.status, 503);
  } finally {
    process.env.INSTAGRAM_APP_SECRET = saved.a;
    if (saved.m) process.env.META_APP_SECRET = saved.m;
  }
});
