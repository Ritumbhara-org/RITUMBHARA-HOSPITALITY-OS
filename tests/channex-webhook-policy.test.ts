import { test } from "node:test"
import assert from "node:assert/strict"
import { checkWebhookSecret } from "../lib/channex/webhook-auth"
import { isPublicPath, isCronPath } from "../lib/auth/policy"

const SECRET = "channex-secret-0123456789abcdef"

test("webhook secret: missing or short secret refuses everything; wrong or absent header is unauthorized", () => {
  assert.equal(checkWebhookSecret(SECRET, undefined), "unconfigured")
  assert.equal(checkWebhookSecret(SECRET, "short"), "unconfigured")
  assert.equal(checkWebhookSecret(null, SECRET), "unauthorized")
  assert.equal(checkWebhookSecret("nope", SECRET), "unauthorized")
  assert.equal(checkWebhookSecret(SECRET, SECRET), "ok")
})

test("the Channex webhook path is public (self-authenticated); the doctor and other channex paths are not", () => {
  assert.equal(isPublicPath("/api/channex/webhook"), true)
  assert.equal(isPublicPath("/api/channex/webhook/"), true)
  assert.equal(isPublicPath("/api/channex/doctor"), false)
  assert.equal(isPublicPath("/api/channex/webhook/extra"), false)
  assert.equal(isCronPath("/api/cron/channex"), true)
})
