import { test } from "node:test";
import assert from "node:assert/strict";
import { sendViaGmailBridge, gmailBridgeConfigured } from "../lib/inbox/email-send";

test("sendViaGmailBridge posts the reply with the shared secret", async () => {
  process.env.GMAIL_BRIDGE_URL = "https://script.google.com/macros/s/abc/exec";
  process.env.INBOX_WEBHOOK_SECRET = "s3cret";
  assert.equal(gmailBridgeConfigured(), true);
  let seen: { url: string; body: Record<string, unknown> } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ ok: true, id: "18c0" }), { status: 200 });
  }) as unknown as typeof fetch;
  const res = await sendViaGmailBridge("18c0", "Hi! Check-in is from 2 pm.", fake);
  assert.deepEqual(res, { ok: true, id: "18c0" });
  assert.equal(seen!.url, "https://script.google.com/macros/s/abc/exec");
  assert.deepEqual(seen!.body, { action: "reply", secret: "s3cret", gmailId: "18c0", text: "Hi! Check-in is from 2 pm." });
});

test("sendViaGmailBridge surfaces the script's error", async () => {
  process.env.GMAIL_BRIDGE_URL = "https://script.google.com/macros/s/abc/exec";
  process.env.INBOX_WEBHOOK_SECRET = "s3cret";
  const fake = (async () => new Response(JSON.stringify({ ok: false, error: "Not an OTA email" }), { status: 200 })) as unknown as typeof fetch;
  const res = await sendViaGmailBridge("x", "hello", fake);
  assert.deepEqual(res, { ok: false, error: "Not an OTA email" });
});
