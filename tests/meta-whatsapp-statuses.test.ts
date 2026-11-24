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

