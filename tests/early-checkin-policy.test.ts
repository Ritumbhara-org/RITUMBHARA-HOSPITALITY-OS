import { test } from "node:test";
import assert from "node:assert/strict";
import { EARLY_CHECKIN_LATEST, EARLY_CHECKIN_POLICY } from "../lib/inbox/policies";
import { QUICK_REPLIES } from "../lib/inbox/quick-replies";

test("early check-in policy caps at 11:30 AM, subject to availability", () => {
  assert.equal(EARLY_CHECKIN_LATEST, "11:30 AM");
  assert.match(EARLY_CHECKIN_POLICY, /11:30 AM/);
  assert.match(EARLY_CHECKIN_POLICY, /subject to availability/);
});

test("early check-in quick reply states the 11:30 AM limit", () => {
  const reply = QUICK_REPLIES.find((q) => q.id === "early-checkin");
  assert.ok(reply);
  assert.match(reply.text, new RegExp(EARLY_CHECKIN_LATEST));
  assert.match(reply.text, /subject to availability/);
});
