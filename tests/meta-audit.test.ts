// Read-only Meta audit: Preview-only, key-gated, GET-only, never leaks the token.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

let runMetaAudit: any, GET: any;
before(async () => {
  ({ runMetaAudit } = await import(mod("lib/whatsapp/meta/audit.ts")));
  ({ GET } = await import(mod("app/api/whatsapp/meta-audit/route.ts")));
});

const TOKEN = "EAAtesttoken1234567890abcdefghijklmnop";
const KEY = "k".repeat(40);

function fakeGraph(calls: { url: string; method: string }[]) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method) });
    const u = new URL(url);
    const p = u.pathname;
    const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (p.endsWith("/debug_token")) return json({ data: { is_valid: true, type: "SYSTEM_USER", app_id: "999", application: "Ritumbhara OS", expires_at: 0, scopes: ["whatsapp_business_messaging", "whatsapp_business_management"], granular_scopes: [{ scope: "whatsapp_business_messaging", target_ids: ["1087709954039944"] }] } });
    if (p.endsWith("/999")) return json({ id: "999", name: "Ritumbhara OS" });
    if (p.endsWith("/1087709954039944")) return json({ id: "1087709954039944", name: "Studios By Ritumbhara", account_review_status: "APPROVED" });
    if (p.endsWith("/phone_numbers")) return json({ data: [{ id: "1436725439515343", display_phone_number: "+1 711-694-6197", status: "CONNECTED", code_verification_status: "VERIFIED", name_status: "APPROVED", quality_rating: "GREEN" }] });
    if (p.endsWith("/message_templates")) return json({ data: [] });
    if (p.endsWith("/subscribed_apps")) return json({ error: { code: 190, message: "Invalid token " + TOKEN } }, 400);
    return json({}, 404);
  }) as unknown as typeof fetch;
}

test("audit: GET only, reads WABA/phones/templates/subscriptions, finds the test number, never includes the token", async () => {
  const calls: { url: string; method: string }[] = [];
  const r = await runMetaAudit({ token: TOKEN, wabaId: "1087709954039944", testNumber: "+17116946197", fetchImpl: fakeGraph(calls) });
  assert.ok(calls.every((c) => c.method === "GET"));
  assert.equal(r.token.type, "SYSTEM_USER");
  assert.equal(r.token.expiresAt, "never");
  assert.deepEqual(r.requiredPermissions, { whatsapp_business_messaging: true, whatsapp_business_management: true });
  assert.equal(r.app.name, "Ritumbhara OS");
  assert.equal(r.waba.name, "Studios By Ritumbhara");
  assert.deepEqual(r.testNumber, { found: true, phoneNumberId: "1436725439515343", status: "CONNECTED", codeVerificationStatus: "VERIFIED", nameStatus: "APPROVED", qualityRating: "GREEN", platformType: undefined, accountMode: undefined });
  assert.equal(r.templates.count, 0);
  const out = JSON.stringify(r);
  assert.ok(!out.includes(TOKEN), "token must never appear in the report");
  assert.ok(!/EAA[A-Za-z0-9]{20,}/.test(out));
  assert.match(out, /\[redacted\]/); // the error message that echoed the token was scrubbed
  // The token travels only in the Authorization header, never in a URL.
  assert.ok(calls.every((c) => !c.url.includes(TOKEN.slice(0, 20)) || c.url.includes("input_token")));
});

test("audit: missing token or bad WABA id is reported as a blocker without any request", async () => {
  const calls: { url: string; method: string }[] = [];
  assert.match((await runMetaAudit({ token: "", wabaId: "1087709954039944", fetchImpl: fakeGraph(calls) })).blocker, /META_WA_ACCESS_TOKEN/);
  assert.match((await runMetaAudit({ token: TOKEN, wabaId: "abc", fetchImpl: fakeGraph(calls) })).blocker, /waba/);
  assert.equal(calls.length, 0);
});

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  return fn().finally(() => { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}

test("route: 404 on production, without a key, with a wrong key, or with a short configured key", async () => {
  const url = "https://os.example.com/api/whatsapp/meta-audit?waba=1087709954039944&key=" + KEY;
  await withEnv({ VERCEL_ENV: "production", META_AUDIT_KEY: KEY, META_WA_ACCESS_TOKEN: TOKEN }, async () => assert.equal((await GET(new Request(url))).status, 404));
  await withEnv({ VERCEL_ENV: "preview", META_AUDIT_KEY: KEY, META_WA_ACCESS_TOKEN: TOKEN }, async () => {
    assert.equal((await GET(new Request("https://os.example.com/api/whatsapp/meta-audit"))).status, 404);
    assert.equal((await GET(new Request(url.replace(KEY, "x".repeat(40))))).status, 404);
  });
  await withEnv({ VERCEL_ENV: "preview", META_AUDIT_KEY: "short", META_WA_ACCESS_TOKEN: TOKEN }, async () => assert.equal((await GET(new Request(url.replace(KEY, "short")))).status, 404));
});

test("route: preview + right key, no token configured -> 200 with a blocker and no token-shaped text", async () => {
  await withEnv({ VERCEL_ENV: "preview", META_AUDIT_KEY: KEY, META_WA_ACCESS_TOKEN: undefined }, async () => {
    const res = await GET(new Request("https://os.example.com/api/whatsapp/meta-audit?waba=1087709954039944&key=" + KEY));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.blocker, /META_WA_ACCESS_TOKEN/);
    assert.equal(body.readOnly, true);
  });
});
