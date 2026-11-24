// Website SEO Audit - hardened fetcher: connect-time address guard, redirects, size caps, decompression, timeouts.
// node:https is replaced with a fake so no network is used; the fake also hands us the `lookup` function the fetcher
// gives the socket layer, which is where the DNS-answer check happens.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import zlib from "node:zlib"
import type dns from "node:dns"

interface FakeReply {
  status: number
  headers?: Record<string, string>
  body?: Buffer | string
  /** Never answer (to test the time limit). */
  hang?: boolean
}
interface RequestOptions {
  hostname: string
  port?: string
  path: string
  headers: Record<string, string>
  lookup: (host: string, opts: { all?: boolean }, cb: (err: Error | null, a: unknown, f?: number) => void) => void
  signal: AbortSignal
}

const seen: RequestOptions[] = []
let handler: (o: RequestOptions) => FakeReply = () => ({ status: 200, headers: { "content-type": "text/html" }, body: "<html></html>" })

function fakeRequest(options: RequestOptions, onResponse: (res: Readable & { statusCode: number; headers: Record<string, string> }) => void) {
  seen.push(options)
  const req = new EventEmitter() as EventEmitter & { end: () => void }
  req.end = () => {
    let reply: FakeReply
    try {
      reply = handler(options)
    } catch (e) {
      // Like Node: socket-level failures arrive as an 'error' event on the request, never as a synchronous throw.
      setImmediate(() => req.emit("error", e))
      return
    }
    if (reply.hang) {
      options.signal.addEventListener("abort", () => req.emit("error", Object.assign(new Error("aborted"), { name: "AbortError", code: "ABORT_ERR" })))
      return
    }
    const body = typeof reply.body === "string" ? Buffer.from(reply.body) : reply.body ?? Buffer.alloc(0)
    // Deliver the body in small chunks like a real socket would.
    const chunks: Buffer[] = []
    for (let i = 0; i < body.length; i += 16 * 1024) chunks.push(body.subarray(i, i + 16 * 1024))
    const res = Object.assign(Readable.from(chunks, { objectMode: false }), { statusCode: reply.status, headers: reply.headers ?? {} })
    setImmediate(() => onResponse(res as never))
  }
  return req
}
mock.module("node:https", { defaultExport: { request: fakeRequest }, namedExports: { request: fakeRequest } })
mock.module("node:http", { defaultExport: { request: fakeRequest }, namedExports: { request: fakeRequest } })

import path from "node:path"
import { pathToFileURL } from "node:url"

// Modules that use node:https must be loaded AFTER the mock above (static imports are hoisted above it).
const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href
type SafeFetch = typeof import("../lib/seo/safe-fetch").safeFetch
let cached: SafeFetch | undefined
const safeFetch: SafeFetch = async (...args) => {
  cached ??= ((await import(mod("lib/seo/safe-fetch.ts"))) as { safeFetch: SafeFetch }).safeFetch
  return cached(...args)
}
// Duck-typed on purpose: the class loaded through the dynamic import is not guaranteed to be the same object.
interface SeoErr extends Error { code: string }
const isSeoErr = (e: unknown): e is SeoErr => e instanceof Error && e.name === "SeoAuditError" && typeof (e as SeoErr).code === "string"

const HTML = { "content-type": "text/html; charset=utf-8" }
const resolverTo = (...ips: string[]) =>
  ((_host: string, _opts: unknown, cb: (e: null, a: dns.LookupAddress[]) => void) =>
    cb(null, ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))) as unknown as typeof dns.lookup

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    assert.ok(isSeoErr(e), "must throw SeoAuditError, got " + String(e))
    return e.code
  }
  return "no-error"
}
const callLookup = (o: RequestOptions, host = "example.com") =>
  new Promise<{ err: Error | null; result: unknown }>((resolve) => o.lookup(host, { all: true }, (err, result) => resolve({ err, result })))

beforeEach(() => {
  seen.length = 0
  handler = () => ({ status: 200, headers: HTML, body: "<html><title>ok</title></html>" })
})

test("returns status, final URL, content type and decoded body for a normal page", async () => {
  const res = await safeFetch("https://example.com/a", { resolver: resolverTo("93.184.216.34") })
  assert.equal(res.status, 200)
  assert.equal(res.url, "https://example.com/a")
  assert.match(res.contentType, /text\/html/)
  assert.match(res.body, /<title>ok<\/title>/)
  assert.equal(res.truncated, false)
  assert.equal(seen[0].hostname, "example.com")
  assert.match(seen[0].headers["User-Agent"], /SEOAudit/)
})

test("non-2xx statuses are returned to the caller, not thrown", async () => {
  handler = () => ({ status: 404, headers: HTML, body: "nope" })
  assert.equal((await safeFetch("https://example.com/missing", { resolver: resolverTo("93.184.216.34") })).status, 404)
})

test("refuses blocked addresses before any request is made", async () => {
  for (const url of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://localhost/", "https://example.com:8443/", "file:///etc/passwd"]) {
    assert.notEqual(await codeOf(safeFetch(url)), "no-error", url)
  }
  assert.equal(seen.length, 0, "no socket may be opened for a refused URL")
})

test("connect-time guard: a public-looking hostname that resolves to a private address is refused", async () => {
  await safeFetch("https://rebind.example.com/", { resolver: resolverTo("10.0.0.7") })
  const { err } = await callLookup(seen[0], "rebind.example.com")
  assert.ok(err, "lookup must fail")
  assert.equal((err as { code?: string }).code, "ESEO_BLOCKED")
})

test("connect-time guard: every DNS answer is checked, one private record poisons the lot", async () => {
  await safeFetch("https://mixed.example.com/", { resolver: resolverTo("93.184.216.34", "169.254.169.254") })
  assert.equal((await callLookup(seen[0])).err?.message, "blocked address")
  for (const ip of ["127.0.0.1", "::1", "192.168.1.10", "fd00::5", "::ffff:10.0.0.1"]) {
    seen.length = 0
    await safeFetch("https://x.example.com/", { resolver: resolverTo(ip) })
    assert.ok((await callLookup(seen[0])).err, ip)
  }
})

test("connect-time guard: all-public answers pass through (both address families)", async () => {
  await safeFetch("https://ok.example.com/", { resolver: resolverTo("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946") })
  const { err, result } = await callLookup(seen[0])
  assert.equal(err, null)
  assert.equal((result as Array<{ address: string }>).length, 2)
})

test("a refused address surfaces as blocked_url, never with the raw network error", async () => {
  // Make the fake socket layer behave like Node does when `lookup` fails: the request errors with the lookup's error.
  const blocked = Object.assign(new Error("connect failed 10.0.0.7:80"), { code: "ESEO_BLOCKED" })
  handler = () => { throw blocked }
  const err = await safeFetch("https://rebind.example.com/", { resolver: resolverTo("10.0.0.7") }).catch((e) => e)
  assert.ok(isSeoErr(err))
  assert.equal(err.code, "blocked_url")
  assert.doesNotMatch(err.message, /10\.0\.0\.7/)
})

test("redirects: same-site hops are followed and the final URL is reported", async () => {
  handler = (o) =>
    o.path === "/old"
      ? { status: 301, headers: { location: "https://www.example.com/new" } }
      : { status: 200, headers: HTML, body: "<html>new</html>" }
  const res = await safeFetch("https://example.com/old", { resolver: resolverTo("93.184.216.34") })
  assert.equal(res.url, "https://www.example.com/new")
  assert.equal(res.status, 200)
  assert.equal(seen.length, 2)
})

test("redirects: http -> https on the same host is allowed", async () => {
  handler = (o) => (o.port === undefined && seen.length === 1 ? { status: 308, headers: { location: "https://example.com/" } } : { status: 200, headers: HTML, body: "x" })
  assert.equal((await safeFetch("http://example.com/", { resolver: resolverTo("93.184.216.34") })).url, "https://example.com/")
})

test("redirects: to a different site, a private IP, the metadata endpoint, localhost or another scheme is refused", async () => {
  const targets = [
    "https://evil.example.org/",
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:8080/admin",
    "http://localhost/",
    "http://[::1]/",
    "http://10.0.0.1/",
    "file:///etc/passwd",
    "gopher://example.com/",
    "https://example.com:6379/",
  ]
  for (const location of targets) {
    seen.length = 0
    handler = () => ({ status: 302, headers: { location } })
    const code = await codeOf(safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34") }))
    assert.notEqual(code, "no-error", location)
    assert.equal(seen.length, 1, "must not request the redirect target: " + location)
  }
})

test("redirects: a loop is cut off after 3 hops", async () => {
  handler = () => ({ status: 302, headers: { location: "https://example.com/again" } })
  assert.equal(await codeOf(safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34") })), "unreachable")
  assert.equal(seen.length, 4) // original + 3 redirects
})

test("body size is capped and the response is flagged truncated", async () => {
  handler = () => ({ status: 200, headers: HTML, body: "a".repeat(200_000) })
  const res = await safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34"), maxBytes: 50_000 })
  assert.equal(res.body.length, 50_000)
  assert.equal(res.truncated, true)
})

test("gzip and brotli bodies are decoded; a compression bomb is stopped at the decoded cap", async () => {
  const text = "<html>" + "hello ".repeat(1000) + "</html>"
  handler = () => ({ status: 200, headers: { ...HTML, "content-encoding": "gzip" }, body: zlib.gzipSync(text) })
  assert.equal((await safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34") })).body, text)

  handler = () => ({ status: 200, headers: { ...HTML, "content-encoding": "br" }, body: zlib.brotliCompressSync(text) })
  assert.equal((await safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34") })).body, text)

  const bomb = zlib.gzipSync(Buffer.alloc(50 * 1024 * 1024, 97)) // ~50 MB of "a" in a few KB
  assert.ok(bomb.length < 100_000)
  handler = () => ({ status: 200, headers: { ...HTML, "content-encoding": "gzip" }, body: bomb })
  const res = await safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34"), maxBytes: 1_000_000 })
  assert.equal(res.body.length, 1_000_000)
  assert.equal(res.truncated, true)
})

test("an unknown content-encoding is refused rather than parsed as garbage", async () => {
  handler = () => ({ status: 200, headers: { ...HTML, "content-encoding": "zstd" }, body: "x" })
  assert.equal(await codeOf(safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34") })), "unreachable")
})

test("a site that never answers hits the time limit", async () => {
  handler = () => ({ status: 0, hang: true })
  const started = Date.now()
  assert.equal(await codeOf(safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34"), timeoutMs: 60 })), "timeout")
  assert.ok(Date.now() - started < 1000)
})

test("a shared deadline that has already passed fails fast as a timeout", async () => {
  assert.equal(await codeOf(safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34"), deadline: Date.now() - 1 })), "timeout")
  assert.equal(seen.length, 0)
})

test("network errors map to friendly codes without leaking details", async () => {
  const cases: Array<[string, string]> = [
    ["ENOTFOUND", "unreachable"],
    ["ECONNREFUSED", "unreachable"],
    ["ETIMEDOUT", "timeout"],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "unreachable"],
  ]
  for (const [code, expected] of cases) {
    handler = () => { throw Object.assign(new Error(`connect ${code} 10.1.2.3:443 internal-host.corp`), { code }) }
    const err = await safeFetch("https://example.com/", { resolver: resolverTo("93.184.216.34") }).catch((e) => e)
    assert.ok(isSeoErr(err), code)
    assert.equal(err.code, expected, code)
    assert.doesNotMatch(err.message, /10\.1\.2\.3|internal-host/, code)
  }
})
