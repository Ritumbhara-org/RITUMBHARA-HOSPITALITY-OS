// lib/instagram/ingest.ts with an in-memory fake database.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: {} }, defaultExport: {} });
mock.module(mod("lib/notifications/service.ts"), { namedExports: { notifyAdmin: async () => undefined } });

type Conv = Record<string, any>;
function fakeDb() {
  const conversations: Conv[] = [];
  const messages: Record<string, any>[] = [];
  const db = {
    inboxMessage: {
      findUnique: async ({ where }: any) => messages.find((m) => m.externalMessageId === where.externalMessageId) ?? null,
      create: async ({ data }: any) => { messages.push({ id: "msg" + messages.length, ...data }); return messages.at(-1); },
    },
    inboxConversation: {
      findUnique: async ({ where }: any) =>
        conversations.find((c) => c.externalThreadId === where.channel_externalThreadId.externalThreadId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const c = conversations.find((x) => x.externalThreadId === where.channel_externalThreadId.externalThreadId);
        if (c) { Object.assign(c, update); return c; }
        const row = { id: "conv" + conversations.length, propertyId: null, status: "OPEN", ...create };
        conversations.push(row);
        return row;
      },
    },
  };
  return { db, conversations, messages };
}

let ingestInstagramDM: any;
before(async () => { ({ ingestInstagramDM } = await import(mod("lib/instagram/ingest.ts"))); });

const GUEST = "998877665544332";
const dm = (mid: string, direction: "INBOUND" | "OUTBOUND", text: string, at = new Date()) => ({ mid, guestId: GUEST, direction, text, at, raw: {} });

test("ingest: first DM creates the conversation with the guest's name, notifies, and a retry is skipped", async () => {
  const { db, conversations, messages } = fakeDb();
  const notified: any[] = [];
  let lookups = 0;
  const deps = {
    db,
    lookupProfile: async () => { lookups++; return { name: "Asha Mehta", username: "asha.m" }; },
    notify: async (d: any) => { notified.push(d); },
  };
  assert.equal(await ingestInstagramDM(dm("m1", "INBOUND", "Hi! Is parking available?"), deps), "stored");
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].channel, "INSTAGRAM");
  assert.equal(conversations[0].externalThreadId, "ig:" + GUEST);
  assert.equal(conversations[0].replyTo, GUEST);
  assert.equal(conversations[0].guestName, "Asha Mehta");
  assert.equal(conversations[0].guestContact, "@asha.m");
  assert.equal(messages[0].senderName, "Asha Mehta");
  assert.equal(notified.length, 1);
  assert.match(notified[0].title, /New Instagram message from Asha Mehta/);

  assert.equal(await ingestInstagramDM(dm("m1", "INBOUND", "Hi! Is parking available?"), deps), "duplicate");
  assert.equal(messages.length, 1);

  // Known guest: no second profile lookup. A reply from the Instagram app is stored as OUTBOUND and marks it read.
  const later = new Date(Date.now() + 1000);
  assert.equal(await ingestInstagramDM(dm("m2", "OUTBOUND", "Yes, free parking.", later), deps), "stored");
  assert.equal(lookups, 1);
  assert.equal(messages[1].direction, "OUTBOUND");
  assert.equal(conversations[0].lastReadAt, later);
  assert.equal(notified.length, 1);
});

test("ingest: a closed conversation re-opens on a new guest message", async () => {
  const { db, conversations } = fakeDb();
  const deps = { db, lookupProfile: async () => ({ name: null, username: "guest1" }), notify: async () => undefined };
  await ingestInstagramDM(dm("a1", "INBOUND", "hello", new Date(Date.now() - 5000)), deps);
  assert.equal(conversations[0].guestName, "@guest1");
  conversations[0].status = "CLOSED";
  await ingestInstagramDM(dm("a2", "INBOUND", "one more question"), deps);
  assert.equal(conversations[0].status, "OPEN");
  assert.equal(conversations[0].lastMessagePreview, "one more question");
});
