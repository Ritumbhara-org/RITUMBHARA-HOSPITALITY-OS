// Route-level tests for app/api/whatsapp/meta-webhook/route.ts (pipeline and next/server's after() mocked).
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

const deferred: (() => Promise<void>)[] = [];
const processed: { id: string; senderPhone: string; text: string }[] = [];

mock.module("next/server", {
  namedExports: {
    NextResponse: { json: (b: unknown, init?: ResponseInit) => Response.json(b, init) },
    after: (fn: () => Promise<void>) => { deferred.push(fn); },
  },
});
mock.module(mod("lib/whatsapp/meta/pipeline.ts"), {
  namedExports: {
    defaultPipelineDeps: () => ({}),
    processMetaInbound: async (m: { id: string; senderPhone: string; text: string }) => { processed.push({ id: m.id, senderPhone: m.senderPhone, text: m.text }); return "guest_ai"; },
  },
});

const SECRET = "app_secret_for_tests_only_0123456789";
const VERIFY = "verify_token_for_tests_123";
process.env.META_APP_SECRET = SECRET;
process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY;
process.env.META_WA_ACCESS_TOKEN = "t";
process.env.META_WA_PHONE_NUMBER_ID = "1234567890";

let GET: any, POST: any;
before(async () => { ({ GET, POST } = await import(mod("app/api/whatsapp/meta-webhook/route.ts"))); });
const URL_ = "https://os.example.com/api/whatsapp/meta-webhook";

function payload(id: string, text = "Hello", phoneNumberId = "1234567890") {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, contacts: [], messages: [{ from: "919000000001", id, type: "text", text: { body: text } }] } }] }] });
}
function signed(body: string, secret = SECRET) {
  return new Request(URL_, { method: "POST", body, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=" + createHmac("sha256", secret).update(body).digest("hex") } });
}
async function drain() { while (deferred.length) await deferred.shift()!(); }

test("GET handshake: right token echoes the challenge; wrong token or mode is 403", async () => {
  const ok = await GET(new Request(URL_ + "?hub.mode=subscribe&hub.verify_token=" + VERIFY + "&hub.challenge=12345"));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "12345");
  assert.equal((await GET(new Request(URL_ + "?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1"))).status, 403);
  assert.equal((await GET(new Request(URL_ + "?hub.mode=other&hub.verify_token=" + VERIFY))).status, 403);
});

test("POST: valid signature -> 200 at once, message processed after the response", async () => {
  processed.length = 0;
  const res = await POST(signed(payload("wamid.1")));
  assert.equal(res.status, 200);
  assert.equal(processed.length, 0); // nothing ran before the response
  await drain();
  assert.deepEqual(processed, [{ id: "wamid.1", senderPhone: "+919000000001", text: "Hello" }]);
});

test("POST: bad or missing signature -> 401 and nothing is processed", async () => {
  processed.length = 0;
  assert.equal((await POST(signed(payload("wamid.2"), "wrong_secret_000000000000000"))).status, 401);
  assert.equal((await POST(new Request(URL_, { method: "POST", body: payload("wamid.2") }))).status, 401);
  await drain();
  assert.equal(processed.length, 0);
});

test("POST: a retried message id is processed once; other phone numbers and status events are ignored", async () => {
  processed.length = 0;
  await POST(signed(payload("wamid.3")));
  await POST(signed(payload("wamid.3")));
  await POST(signed(payload("wamid.4", "hi", "999999")));
  await POST(signed(JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1234567890" }, statuses: [{ id: "wamid.5", status: "read" }] } }] }] })));
  await drain();
  assert.deepEqual(processed.map((p) => p.id), ["wamid.3"]);
});

test("POST: without META_WA_PHONE_NUMBER_ID nothing is processed (even with no access token set)", async () => {
  const savedId = process.env.META_WA_PHONE_NUMBER_ID, savedTok = process.env.META_WA_ACCESS_TOKEN;
  delete process.env.META_WA_PHONE_NUMBER_ID;
  delete process.env.META_WA_ACCESS_TOKEN;
  processed.length = 0;
  try {
    assert.equal((await POST(signed(payload("wamid.7")))).status, 200);
    await drain();
    assert.equal(processed.length, 0);
    // Phone id set, token missing: the filter still applies (only our number is processed).
    process.env.META_WA_PHONE_NUMBER_ID = "1234567890";
    await POST(signed(payload("wamid.8", "hi", "999999")));
    await POST(signed(payload("wamid.9")));
    await drain();
    assert.deepEqual(processed.map((p) => p.id), ["wamid.9"]);
  } finally {
    process.env.META_WA_PHONE_NUMBER_ID = savedId;
    process.env.META_WA_ACCESS_TOKEN = savedTok;
  }
});

test("POST: fail closed when the Meta webhook secrets are not configured", async () => {
  const saved = process.env.META_APP_SECRET;
  delete process.env.META_APP_SECRET;
  try {
    assert.equal((await POST(signed(payload("wamid.6")))).status, 503);
    assert.equal((await GET(new Request(URL_ + "?hub.mode=subscribe&hub.verify_token=" + VERIFY + "&hub.challenge=1"))).status, 403);
  } finally {
    process.env.META_APP_SECRET = saved;
  }
});

test("auth policy: the Meta webhook is public (self-authenticated); the Twilio webhook stays public", async () => {
  const { isPublicPath } = await import(mod("lib/auth/policy.ts"));
  assert.equal(isPublicPath("/api/whatsapp/meta-webhook"), true);
  assert.equal(isPublicPath("/api/whatsapp/webhook"), true);
  assert.equal(isPublicPath("/api/whatsapp/meta-webhook-other"), false);
});
