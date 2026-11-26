// applyMetaStatuses (real module): status only moves forward; failures never throw. No database.
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mod = (p: string) => pathToFileURL(path.join(path.resolve(__dirname, ".."), p)).href;
mock.module(mod("lib/prisma.ts"), { namedExports: { prisma: { whatsAppMessage: { updateMany: async () => ({ count: 0 }) } } } });

let applyMetaStatuses: any;
before(async () => { ({ applyMetaStatuses } = await import(mod("lib/whatsapp/meta/statuses.ts"))); });

test("applyMetaStatuses: moves forward only, FAILED only before delivery", async () => {
  const calls: { id: string; next: string; may: string[] }[] = [];
  const ev = (id: string, status: string) => ({ id, status, recipientDigits: "", timestamp: 0, errorCode: status === "failed" ? 131026 : null, errorTitle: null });
  const s = await applyMetaStatuses([ev("a", "delivered"), ev("a", "read"), ev("b", "failed")], { update: async (id: string, next: string, may: string[]) => { calls.push({ id, next, may }); return 1; } });
  assert.deepEqual(calls.map((c) => c.next), ["DELIVERED", "READ", "FAILED"]);
  assert.deepEqual(calls[0].may, ["PENDING", "SENT"]);
  assert.ok(!calls[1].may.includes("READ"));
  assert.ok(!calls[2].may.includes("DELIVERED") && !calls[2].may.includes("READ"));
  assert.equal(s.failed, 1);
  // a failing update never throws
  await applyMetaStatuses([ev("c", "sent")], { update: async () => { throw new Error("db"); } });
});


const ev = (id: string, status: string) => ({ id, status, recipientDigits: "", timestamp: 0, errorCode: status === "failed" ? 131026 : null, errorTitle: null });

// A tiny in-memory outbound table that applies the same forward-only rule as the real updateMany.
function table(rows: Record<string, string>) {
  return async (id: string, next: string, may: string[]) => {
    if (!(id in rows) || !may.includes(rows[id])) return 0;
    rows[id] = next;
    return 1;
  };
}

test("statuses: full lifecycle SENT -> DELIVERED -> READ, and FAILED for an undelivered message", async () => {
  const rows: Record<string, string> = { m1: "SENT", m2: "SENT" };
  await applyMetaStatuses([ev("m1", "sent"), ev("m1", "delivered"), ev("m1", "read"), ev("m2", "failed")], { update: table(rows), retryDelayMs: 0 });
  assert.deepEqual(rows, { m1: "READ", m2: "FAILED" });
});

test("statuses: out of order and duplicate events never move a message backwards", async () => {
  const rows: Record<string, string> = { m1: "SENT" };
  await applyMetaStatuses([ev("m1", "read"), ev("m1", "delivered"), ev("m1", "sent"), ev("m1", "read"), ev("m1", "failed")], { update: table(rows), retryDelayMs: 0 });
  assert.equal(rows.m1, "READ");
});

test("statuses: an event that arrives before the outbound row is written is applied on the single retry", async () => {
  const rows: Record<string, string> = {};
  const slept: number[] = [];
  const update = table(rows);
  const s = await applyMetaStatuses([ev("late", "failed"), ev("unknown", "delivered")], {
    update,
    retryDelayMs: 1234,
    sleep: async (ms: number) => { slept.push(ms); rows.late = "SENT"; }, // the send's log row lands while we wait
  });
  assert.deepEqual(slept, [1234]);
  assert.equal(rows.late, "FAILED");
  assert.equal(s.updated, 1); // the unknown id (e.g. a message from another app) stays unmatched
});

test("statuses: nothing to retry -> no wait; 'sent' alone is never retried", async () => {
  let slept = 0;
  await applyMetaStatuses([ev("x", "sent")], { update: async () => 0, sleep: async () => { slept++; } });
  await applyMetaStatuses([ev("x", "delivered")], { update: async () => 1, sleep: async () => { slept++; } });
  assert.equal(slept, 0);
});
