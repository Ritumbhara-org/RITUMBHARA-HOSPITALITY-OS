import { test } from "node:test"
import assert from "node:assert/strict"
import { isPathAllowed, isOwnedMediaUrl, kindFromMime, parseReferenceMedia, proofPrefix, REFERENCE_PREFIX } from "../lib/hk/media"

test("path rules keep each role inside its own prefix", () => {
  assert.equal(isPathAllowed("hk/reference/a.jpg", REFERENCE_PREFIX), true)
  assert.equal(isPathAllowed("hk/turnover/u1/a.webm", proofPrefix("u1")), true)
  assert.equal(isPathAllowed("hk/turnover/u2/a.webm", proofPrefix("u1")), false)
  assert.equal(isPathAllowed("hk/turnover/u1/../u2/a.webm", proofPrefix("u1")), false)
  assert.equal(isPathAllowed("hk/turnover/u1/", proofPrefix("u1")), false)
  assert.equal(isPathAllowed("other/a.jpg", REFERENCE_PREFIX), false)
})

test("only our Blob host and prefix are accepted as media URLs", () => {
  const p = proofPrefix("u1")
  assert.equal(isOwnedMediaUrl("https://abc123.public.blob.vercel-storage.com/hk/turnover/u1/v-xyz.webm", p), true)
  assert.equal(isOwnedMediaUrl("https://abc123.public.blob.vercel-storage.com/hk/turnover/u2/v.webm", p), false)
  assert.equal(isOwnedMediaUrl("https://evil.example.com/hk/turnover/u1/v.webm", p), false)
  assert.equal(isOwnedMediaUrl("http://abc123.public.blob.vercel-storage.com/hk/turnover/u1/v.webm", p), false)
  assert.equal(isOwnedMediaUrl("not a url", p), false)
})

test("kindFromMime maps allowed types and rejects others", () => {
  assert.equal(kindFromMime("image/jpeg"), "PHOTO")
  assert.equal(kindFromMime("video/webm"), "VIDEO")
  assert.equal(kindFromMime("video/mp4"), "VIDEO")
  assert.equal(kindFromMime("application/pdf"), null)
})

test("parseReferenceMedia drops malformed entries", () => {
  const out = parseReferenceMedia([{ url: "https://x", kind: "PHOTO" }, { url: 5 }, null, { url: "https://y", kind: "AUDIO" }])
  assert.deepEqual(out, [{ url: "https://x", kind: "PHOTO" }])
  assert.deepEqual(parseReferenceMedia("nope"), [])
})
