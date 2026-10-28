// Preview Twilio guard: Preview deployments can never send through Twilio (fail closed); Production is unchanged;
// the Meta path is unaffected. No network, fake credentials only.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

const logged: Record<string, unknown>[] = [];
const twilioCalls: Record<string, unknown>[] = [];
let twilioClientsCreated = 0;
mock.module(mod("lib/prisma.ts"), {
  namedExports: { prisma: { whatsAppMessage: { create: async (a: { data: Record<string, unknown> }) => { logged.push(a.data); return {}; } } } },
});
mock.module("twilio", {
  defaultExport: Object.assign(() => { twilioClientsCreated++; return { messages: { create: async (p: Record<string, unknown>) => { twilioCalls.push(p); return { sid: "SM1" }; } } }; }, { validateRequest: () => true }),
});

let isTwilioSendBlocked: any, TWILIO_BLOCKED_STATUS: any, sendWhatsAppMessage: any, sendLongStayWhatsApp: any, runWithWhatsAppProvider: any;
before(async () => {
  ({ isTwilioSendBlocked, TWILIO_BLOCKED_STATUS } = await import(mod("lib/twilio/preview-guard.ts")));
  ({ sendWhatsAppMessage } = await import(mod("lib/whatsapp/client.ts")));
  ({ sendLongStayWhatsApp } = await import(mod("lib/long-stay/server.ts")));
  ({ runWithWhatsAppProvider } = await import(mod("lib/whatsapp/meta/config.ts")));
});

const TWILIO_ENV = { TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tok", TWILIO_WHATSAPP_NUMBER: "+918306312778" };

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const keys = ["VERCEL", "VERCEL_ENV", "VERCEL_TARGET_ENV", "WHATSAPP_PROVIDER", ...Object.keys(vars)];
  const old: Record<string, string | undefined> = {};
  for (const k of keys) { old[k] = process.env[k]; delete process.env[k]; }
  for (const k of Object.keys(vars)) if (vars[k] !== undefined) process.env[k] = vars[k];
  return fn().finally(() => { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}
function reset() { logged.length = 0; twilioCalls.length = 0; twilioClientsCreated = 0; }

test("guard matrix: blocked on Preview and unknown Vercel envs (fail closed); allowed on Production and locally", () => {
  assert.equal(isTwilioSendBlocked({ VERCEL: "1", VERCEL_ENV: "preview" }), true);
  assert.equal(isTwilioSendBlocked({ VERCEL_ENV: " Preview " }), true);
  assert.equal(isTwilioSendBlocked({ VERCEL_ENV: "production", VERCEL_TARGET_ENV: "preview" }), true);
  assert.equal(isTwilioSendBlocked({ VERCEL: "1", VERCEL_ENV: "staging" }), true); // unknown -> blocked
  assert.equal(isTwilioSendBlocked({ VERCEL: "1" }), true); // on Vercel but no environment name -> blocked
  assert.equal(isTwilioSendBlocked({ VERCEL: "1", VERCEL_ENV: "production" }), false);
  assert.equal(isTwilioSendBlocked({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production" }), false);
  assert.equal(isTwilioSendBlocked({ VERCEL_ENV: "development" }), false); // `vercel dev` / pulled env: unchanged
  assert.equal(isTwilioSendBlocked({}), false); // local scripts / tests: unchanged
});

test("Preview: sendWhatsAppMessage never creates a Twilio client or sends; logs BLOCKED_PREVIEW", async () => {
  reset();
  const r = await withEnv({ VERCEL: "1", VERCEL_ENV: "preview", ...TWILIO_ENV }, () =>
    sendWhatsAppMessage("+919000000001", "template", "Hi", "booking_confirmation", "Reservation", "r1", { "1": "Asha" }));
  assert.deepEqual(r, { success: false, status: TWILIO_BLOCKED_STATUS });
  assert.equal(twilioClientsCreated, 0);
  assert.equal(twilioCalls.length, 0);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].status, "BLOCKED_PREVIEW");
  assert.equal(logged[0].from, "SYSTEM"); // the production number is not even written to the log
});

test("Production: sendWhatsAppMessage sends through Twilio exactly as before", async () => {
  reset();
  const r = await withEnv({ VERCEL: "1", VERCEL_ENV: "production", ...TWILIO_ENV }, () =>
    sendWhatsAppMessage("+919000000001", "template", "Hi", "booking_confirmation", "Reservation", "r1", { "1": "Asha" }));
  assert.deepEqual(r, { success: true, status: "DELIVERED" });
  assert.equal(twilioCalls.length, 1);
  assert.equal(twilioCalls[0].contentSid, "HX9efde0bf3a839c4264a6eae0a41740dd");
  assert.equal(twilioCalls[0].from, "whatsapp:+918306312778");
  assert.equal(logged[0].status, "DELIVERED");
});

test("Preview + Meta conversation: the Meta path is unaffected by the Twilio guard (still sends via Meta)", async () => {
  reset();
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }); }) as unknown as typeof fetch;
  try {
    const r = await withEnv({ VERCEL: "1", VERCEL_ENV: "preview", ...TWILIO_ENV, META_WA_ACCESS_TOKEN: "t", META_WA_PHONE_NUMBER_ID: "1234567890" }, () =>
      runWithWhatsAppProvider("meta", () => sendWhatsAppMessage("+919000000001", "text", "Hello")));
    assert.deepEqual(r, { success: true, status: "DELIVERED" });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0], /graph\.facebook\.com/);
  assert.equal(twilioClientsCreated, 0);
});

test("Preview: long-stay OTP / signing messages never reach Twilio", async () => {
  reset();
  const r: any = await withEnv({ VERCEL: "1", VERCEL_ENV: "preview", ...TWILIO_ENV }, () =>
    sendLongStayWhatsApp({ to: "+919000000001", kind: "OTP", body: "Your code is 123456", variables: { "1": "123456" }, bookingId: "b1", logBody: "Your code is ******" }));
  assert.equal(r.ok, false);
  assert.match(String(r.error), /Preview/);
  assert.equal(twilioClientsCreated, 0);
  assert.equal(twilioCalls.length, 0);
  assert.equal(logged[0].status, "BLOCKED_PREVIEW");
  assert.equal(logged[0].content, "Your code is ******"); // OTP stays masked in the log
});

test("Production: long-stay messages still go through Twilio as before", async () => {
  reset();
  const r: any = await withEnv({ VERCEL: "1", VERCEL_ENV: "production", ...TWILIO_ENV }, () =>
    sendLongStayWhatsApp({ to: "+919000000001", kind: "OTP", body: "Your code is 123456", variables: { "1": "123456" }, bookingId: "b1" }));
  assert.equal(r.ok, true);
  assert.equal(twilioCalls.length, 1);
});

// Fail closed for the future too: any code that creates a Twilio client must be one of the guarded senders, and the
// guard must run before the client is created.
test("code scan: every Twilio client creation is in a guarded sender, after the Preview guard", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git", "tests", "scratch", ".gemini"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ["app", "lib", "components"]) walk(path.join(root, d));
  const creators = files.filter((f) => /\btwilio\s*\(|api\.twilio\.com|\.messages\.create\s*\(/.test(fs.readFileSync(f, "utf8")));
  const rel = creators.map((f) => path.relative(root, f)).sort();
  assert.deepEqual(rel, ["lib/long-stay/server.ts", "lib/whatsapp/client.ts"]);
  for (const f of creators) {
    const src = fs.readFileSync(f, "utf8");
    const guardAt = src.indexOf("if (isTwilioSendBlocked())");
    const clientAt = src.search(/\btwilio\s*\(\s*accountSid/);
    assert.ok(guardAt > 0 && clientAt > guardAt, path.relative(root, f) + ": the Preview guard must run before the Twilio client is created");
  }
});
