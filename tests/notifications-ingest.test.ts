// Unified inbox: a new guest email (Airbnb, Booking.com, Agoda...) puts one notification in the admin's bell.
// Old mail from a resync and redelivered duplicates stay quiet.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { ParsedInboundEmail } from "../lib/inbox/email-parser"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

const state = {
  existingMessage: null as { id: string; conversationId: string } | null,
  notified: [] as { type: string; title: string; groupKey?: string; body?: string }[],
}

const fakePrisma = {
  inboxMessage: {
    findUnique: async () => state.existingMessage,
    findFirst: async () => null,
    update: async () => ({}),
    create: async () => ({ id: "m1" }),
  },
  inboxConversation: {
    findUnique: async () => null,
    upsert: async () => ({ id: "c1", guestName: "Asha Rao", propertyId: "p1" }),
    update: async () => ({}),
  },
  reservation: { findFirst: async () => null, findMany: async () => [] },
}

mock.module("@prisma/client", { namedExports: { Prisma: { PrismaClientKnownRequestError: class extends Error {} } } })
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: fakePrisma }, defaultExport: fakePrisma })
mock.module(mod("lib/notifications/service.ts"), {
  namedExports: { notifyAdmin: async (draft: { type: string; title: string }) => { state.notified.push(draft) } },
})

beforeEach(() => {
  state.existingMessage = null
  state.notified = []
})

const email = (receivedAt: Date): ParsedInboundEmail => ({
  channel: "AIRBNB",
  inReplyTo: null,
  ignore: false,
  threadKey: "HMABC123",
  subject: "Message from Asha",
  guestName: "Asha Rao",
  fromName: "Airbnb",
  fromEmail: "automated@airbnb.com",
  replyTo: "reply-abc@airbnb.com",
  reservationCode: "HMABC123",
  messageId: "<msg-1@airbnb.com>",
  body: "Hi, is early check-in possible?",
  receivedAt,
})

const ingest = async () => (await import(mod("lib/inbox/ingest.ts"))) as typeof import("../lib/inbox/ingest")

test("a new guest email notifies the admin once, naming the channel and guest", async () => {
  const { ingestInboundEmail } = await ingest()
  const result = await ingestInboundEmail(email(new Date()), {})
  assert.equal(result.duplicate, false)
  assert.equal(state.notified.length, 1)
  assert.equal(state.notified[0].type, "OTA_MESSAGE")
  assert.equal(state.notified[0].title, "New Airbnb message from Asha Rao")
  assert.equal(state.notified[0].groupKey, "inbox:c1")
})

test("an old email filed late (a resync) is stored but not announced", async () => {
  const { ingestInboundEmail } = await ingest()
  await ingestInboundEmail(email(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), {})
  assert.equal(state.notified.length, 0)
})

test("a redelivered email (already stored) does not notify again", async () => {
  state.existingMessage = { id: "m0", conversationId: "c1" }
  const { ingestInboundEmail } = await ingest()
  const result = await ingestInboundEmail(email(new Date()), {})
  assert.equal(result.duplicate, true)
  assert.equal(state.notified.length, 0)
})
