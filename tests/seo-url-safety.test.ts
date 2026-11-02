// Website SEO Audit - SSRF protection: URL validation and IP classification.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test } from "node:test"
import assert from "node:assert/strict"
import { isPublicIp, isSameSite, normalizeInputUrl, validateTargetUrl } from "../lib/seo/url-safety"
import { SeoAuditError } from "../lib/seo/errors"

const codeOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    assert.ok(e instanceof SeoAuditError, "must throw SeoAuditError, got " + String(e))
    return e.code
  }
  return "no-error"
}

test("isPublicIp: public addresses are allowed", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "172.15.255.255", "100.63.255.255", "2606:4700:4700::1111", "2a00:1450:4009:81f::200e"]) {
    assert.equal(isPublicIp(ip), true, ip)
  }
})

test("isPublicIp: private, loopback, link-local, metadata, reserved and multicast are refused", () => {
  const blocked = [
    "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254",
    "169.254.169.254", "169.254.0.1", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.168.0.1", "192.168.255.255",
    "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fc00::1", "fd12:3456:789a::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2",
  ]
  for (const ip of blocked) assert.equal(isPublicIp(ip), false, ip)
})

test("isPublicIp: anything that is not a valid IP is refused", () => {
  for (const ip of ["", "999.1.1.1", "1.2.3", "example.com", "fe80::1%eth0", "::g", "1:2:3:4:5:6:7:8:9"]) {
    assert.equal(isPublicIp(ip), false, JSON.stringify(ip))
  }
})

test("validateTargetUrl: accepts ordinary public web addresses", () => {
  assert.equal(validateTargetUrl("https://www.example.com/stays?x=1#top").toString(), "https://www.example.com/stays?x=1")
  assert.equal(validateTargetUrl("http://example.com:80").hostname, "example.com")
  assert.equal(validateTargetUrl("https://example.com:443/").hostname, "example.com")
  assert.equal(validateTargetUrl("https://8.8.8.8/").hostname, "8.8.8.8")
  assert.equal(validateTargetUrl("https://xn--bcher-kva.example/").hostname, "xn--bcher-kva.example")
})

test("validateTargetUrl: refuses non-http schemes and malformed input as invalid_url", () => {
  for (const raw of ["", "   ", "not a url", "http://", "file:///etc/passwd", "javascript:alert(1)", "ftp://example.com/x", "data:text/html,hi", "gopher://example.com", "https://user:pass@example.com", "https://user@example.com"]) {
    assert.equal(codeOf(() => validateTargetUrl(raw)), "invalid_url", JSON.stringify(raw))
  }
  assert.equal(codeOf(() => validateTargetUrl("https://example.com/" + "a".repeat(2100))), "invalid_url")
})

test("validateTargetUrl: refuses localhost, internal names and private/special IP literals as blocked_url", () => {
  const blocked = [
    "http://localhost", "http://LOCALHOST/", "http://localhost.", "http://app.localhost", "http://127.0.0.1", "http://127.1", "http://0.0.0.0",
    "http://2130706433", // decimal 127.0.0.1
    "http://0x7f.0.0.1", "http://0177.0.0.1", "http://017700000001",
    "http://[::1]", "http://[::ffff:127.0.0.1]", "http://[fe80::1]", "http://[fd00::1]",
    "http://169.254.169.254/latest/meta-data/", "http://metadata.google.internal/computeMetadata/v1/", "http://metadata", "http://intranet", "http://printer.local",
    "http://10.0.0.5", "http://172.16.1.1", "http://192.168.0.1", "http://100.64.0.1",
    "https://example.com:8080", "http://example.com:22", "https://example.com:6379", "http://example.com:3000",
  ]
  for (const raw of blocked) assert.equal(codeOf(() => validateTargetUrl(raw)), "blocked_url", raw)
})

test("normalizeInputUrl: adds https:// to bare domains but never 'fixes' other schemes", () => {
  assert.equal(normalizeInputUrl("example.com"), "https://example.com")
  assert.equal(normalizeInputUrl("  www.example.com/stays "), "https://www.example.com/stays")
  assert.equal(normalizeInputUrl("http://example.com"), "http://example.com")
  assert.equal(normalizeInputUrl("localhost:3000"), "https://localhost:3000")
  assert.equal(normalizeInputUrl(""), "")
  // other schemes are passed through so validateTargetUrl rejects them rather than turning them into https://...
  for (const raw of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "mailto:a@b.com"]) {
    assert.equal(codeOf(() => validateTargetUrl(normalizeInputUrl(raw))), "invalid_url", raw)
  }
  assert.equal(codeOf(() => validateTargetUrl(normalizeInputUrl("localhost:3000"))), "blocked_url")
  assert.equal(codeOf(() => validateTargetUrl(normalizeInputUrl("169.254.169.254"))), "blocked_url")
})

test("isSameSite: treats www and apex as the same site, nothing else", () => {
  assert.equal(isSameSite("https://example.com/a", "https://www.example.com/b"), true)
  assert.equal(isSameSite("http://example.com", "https://example.com"), true)
  assert.equal(isSameSite("https://example.com", "https://evil-example.com"), false)
  assert.equal(isSameSite("https://example.com", "https://example.com.evil.com"), false)
  assert.equal(isSameSite("https://blog.example.com", "https://example.com"), false)
  assert.equal(isSameSite("not a url", "https://example.com"), false)
})
