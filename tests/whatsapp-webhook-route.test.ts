// Route-level tests for app/api/whatsapp/webhook/route.ts with the database and existing handlers mocked.
// Proves the website lead branch sits after staff handling and before the guest AI, and changes nothing else.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

const state = {
  staffReply: null as string | null,
  aiCalls: [] as string[],
  inbound: 0,
  outbound: 0,
  routerCalls: [] as { senderPhone: string; rawBody: string; signature: string | null }[],
  routerResult: null as string | null,
};

mock.module(mod("lib/prisma.ts"), {
  namedExports: { prisma: { whatsAppMessage: { create: async (args: { data: { direction: string } }) => { if (args.data.direction === "OUTBOUND") state.outbound++; else state.inbound++; return {}; } } } },
});
mock.module(mod("lib/whatsapp/action-handler.ts"), {
  namedExports: { handleWhatsAppAction: async () => state.staffReply },
});
mock.module(mod("lib/whatsapp/ai-handler.ts"), {
  namedExports: { handleGuestAIChat: async (phone: string) => { state.aiCalls.push(phone); } },
});
mock.module(mod("lib/whatsapp/website-lead-router.ts"), {
  namedExports: {
    defaultLeadRouterDeps: () => ({}),
    routeToWebsiteLeadBot: async (input: { senderPhone: string; rawBody: string; signature: string | null }) => {
      state.routerCalls.push(input);
      return state.routerResult;
    },
  },
});

function reset() {
  state.staffReply = null;
  state.aiCalls = [];
  state.inbound = 0;
  state.outbound = 0;
  state.routerCalls = [];
  state.routerResult = null;
}

const BODY = "Body=Hi%0ARef%3A+W-FLOATING&From=whatsapp%3A%2B919000000001&To=whatsapp%3A%2B918306312778";

function twilioRequest(body = BODY, signature: string | null = "sig") {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (signature) headers["X-Twilio-Signature"] = signature;
  return new Request("https://os.example.com/api/whatsapp/webhook", { method: "POST", headers, body });
}

async function loadRoute() {
  return (await import(mod("app/api/whatsapp/webhook/route.ts"))) as { POST: (req: Request) => Promise<Response> };
}

test("staff command: unchanged TwiML reply, website router and guest AI never called", async () => {
  reset();
  state.staffReply = "✅ Ticket Acknowledged!";
  const { POST } = await loadRoute();
  const res = await POST(twilioRequest("Body=ACCEPT&From=whatsapp%3A%2B919111111111"));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<Message>✅ Ticket Acknowledged!<\/Message>/);
  assert.equal(state.routerCalls.length, 0);
  assert.equal(state.aiCalls.length, 0);
  assert.equal(state.inbound, 1); // inbound still logged
  assert.equal(state.outbound, 1); // upstream logs the staff TwiML reply too (unchanged by this branch)
});

test("guest or staff chat (router returns null): guest AI runs exactly as before, empty TwiML", async () => {
  reset();
  const { POST } = await loadRoute();
  const res = await POST(twilioRequest());
  assert.equal(res.status, 200);
  assert.equal((await res.text()).trim(), "<Response></Response>");
  assert.deepEqual(state.aiCalls, ["+919000000001"]);
  assert.equal(state.routerCalls.length, 1);
});

test("unknown sender handled by website bot: its TwiML is returned, guest AI not called", async () => {
  reset();
  state.routerResult = "<Response><Message>When would you like to check in?</Message></Response>";
  const { POST } = await loadRoute();
  const res = await POST(twilioRequest());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/xml");
  assert.equal(await res.text(), state.routerResult);
  assert.equal(state.aiCalls.length, 0);
  assert.equal(state.inbound, 1);
});

test("router receives the exact raw body, sender and X-Twilio-Signature", async () => {
  reset();
  const { POST } = await loadRoute();
  await POST(twilioRequest(BODY, "abc123signature"));
  assert.deepEqual(state.routerCalls, [{ senderPhone: "+919000000001", rawBody: BODY, signature: "abc123signature" }]);
});

test("invalid payload (no Body) still returns 400 before any routing", async () => {
  reset();
  const { POST } = await loadRoute();
  const res = await POST(twilioRequest("From=whatsapp%3A%2B919000000001&NumMedia=1"));
  assert.equal(res.status, 400);
  assert.equal(state.routerCalls.length, 0);
});
