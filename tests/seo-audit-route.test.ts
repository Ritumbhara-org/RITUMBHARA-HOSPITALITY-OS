// POST /api/seo/audit - authentication, request validation, SSRF refusals, crawl and AI failure handling,
// rate limiting, and that nothing sensitive reaches the response. No network: node:https is faked with a fixture
// website and the Anthropic provider's fetch() is faked.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, mock, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { NextRequest } from "next/server"
import { SESSION_COOKIE } from "../lib/auth/session"
import { isPublicPath, isCronPath, isSelfAuthenticatedMachinePath } from "../lib/auth/policy"
import { fakeCookies, nextHeadersMock, setAuthEnv, validSessionToken } from "./helpers/auth-env"
import { goodLlmJson, healthySite, fakeSite, html } from "./helpers/seo-fixtures"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href

// ---- fake website over node:https / node:http -------------------------------------------------------------
type Site = ReturnType<typeof fakeSite>
let site: Site = healthySite()
let siteFailure: Error | null = null
const webRequests: string[] = []

function fakeRequest(options: { hostname: string; path: string; signal: AbortSignal }, onResponse: (res: unknown) => void) {
  webRequests.push(options.hostname + options.path)
  const req = new EventEmitter() as EventEmitter & { end: () => void }
  req.end = () => {
    if (siteFailure) {
      const e = siteFailure
      return void setImmediate(() => req.emit("error", e))
    }
    const p = options.hostname === "example.com" ? site(options.path.split("?")[0]) : { status: 404, body: "" }
    const res = Object.assign(Readable.from([Buffer.from(p.body)], { objectMode: false }), {
      statusCode: p.status ?? 200,
      headers: p.headers ?? { "content-type": "text/html; charset=utf-8" },
    })
    setImmediate(() => onResponse(res))
  }
  return req
}
mock.module("node:https", { defaultExport: { request: fakeRequest }, namedExports: { request: fakeRequest } })
mock.module("node:http", { defaultExport: { request: fakeRequest }, namedExports: { request: fakeRequest } })
mock.module("next/headers", nextHeadersMock)

// ---- fake Anthropic API -----------------------------------------------------------------------------------
const API_KEY = "sk-ant-test-key-DO-NOT-LEAK-123"
let llmReply: () => { status: number; body: unknown } | Promise<never> = () => ({ status: 200, body: { content: [{ type: "text", text: goodLlmJson() }] } })
const llmCalls: Array<{ url: string; headers: Record<string, string> }> = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
  llmCalls.push({ url: String(url), headers: init?.headers ?? {} })
  const r = await llmReply()
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) }
}) as unknown as typeof fetch

type Handler = (req: Request) => Promise<Response>
let routeCache: Handler | undefined
/* eslint-disable @typescript-eslint/no-explicit-any */
async function post(body: unknown, opts: { auth?: boolean; raw?: string } = {}) {
  routeCache ??= ((await import(mod("app/api/seo/audit/route.ts"))) as { POST: Handler }).POST
  if (opts.auth !== false) fakeCookies.values.set(SESSION_COOKIE, validSessionToken())
  const req = new NextRequest("https://os.example.com/api/seo/audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts.raw ?? JSON.stringify(body),
  })
  const res = await routeCache(req)
  const text = await res.text()
  return { status: res.status, text, json: JSON.parse(text) as Record<string, any>, headers: res.headers }
}

beforeEach(async () => {
  await setAuthEnv()
  fakeCookies.clear()
  site = healthySite()
  siteFailure = null
  webRequests.length = 0
  llmCalls.length = 0
  llmReply = () => ({ status: 200, body: { content: [{ type: "text", text: goodLlmJson() }] } })
  process.env.SEO_LLM_PROVIDER = "anthropic"
  process.env.ANTHROPIC_API_KEY = API_KEY
  const { resetSeoRateLimit } = await import("../lib/seo/rate-limit")
  resetSeoRateLimit()
})

test("access: signed-out requests get 401 and trigger no crawl and no model call", async () => {
  const res = await post({ url: "https://example.com" }, { auth: false })
  assert.equal(res.status, 401)
  assert.equal(res.json.success, false)
  assert.equal(webRequests.length, 0)
  assert.equal(llmCalls.length, 0)
})

test("access: a forged or expired session cookie is refused", async () => {
  fakeCookies.values.set(SESSION_COOKIE, "forged.token")
  const routeMod = (await import(mod("app/api/seo/audit/route.ts"))) as { POST: Handler }
  const res = await routeMod.POST(new NextRequest("https://os.example.com/api/seo/audit", { method: "POST", body: JSON.stringify({ url: "https://example.com" }) }))
  assert.equal(res.status, 401)
  assert.equal(webRequests.length, 0)
})

test("access: the audit API is not a public path (the proxy gates it too)", async () => {
  for (const p of ["/api/seo/audit", "/api/seo", "/seo-audit", "/seo", "/api/seo/audit/"]) {
    assert.equal(isPublicPath(p), false, p)
    assert.equal(isCronPath(p), false, p)
    assert.equal(isSelfAuthenticatedMachinePath(p), false, p)
  }
  const { proxy } = (await import(mod("proxy.ts"))) as { proxy: (r: NextRequest) => Response }
  const noSession = proxy(new NextRequest("https://os.example.com/api/seo/audit", { method: "POST" }))
  assert.equal(noSession.status, 401)
  const page = proxy(new NextRequest("https://os.example.com/seo-audit"))
  assert.equal(page.status, 307)
  assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fseo-audit/)
  const withSession = proxy(new NextRequest("https://os.example.com/api/seo/audit", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${validSessionToken()}` } }))
  assert.equal(withSession.headers.get("x-middleware-next"), "1")
})

test("flow: a valid URL is crawled (5 pages), audited and analysed; response is not cacheable", async () => {
  const res = await post({ url: "example.com" }) // bare domain accepted
  assert.equal(res.status, 200)
  assert.equal(res.json.success, true)
  const d = res.json.data
  assert.equal(d.url, "https://example.com/")
  assert.equal(d.score, 100)
  assert.equal(d.pagesCrawled.length, 5)
  assert.equal(d.issues.length, 0)
  assert.equal(d.ai.status, "partial") // the fixture answer deliberately includes invented references
  assert.ok(d.ai.data.actionPlan.length >= 1)
  assert.equal(res.headers.get("cache-control"), "no-store")
  // exactly one model call, with the key in the header only
  assert.equal(llmCalls.length, 1)
  assert.equal(llmCalls[0].url, "https://api.anthropic.com/v1/messages")
  assert.equal(llmCalls[0].headers["x-api-key"], API_KEY)
})

test("flow: never leaks keys, stack traces or file paths", async () => {
  const scenarios: Array<() => void> = [
    () => void 0,
    () => { llmReply = () => ({ status: 401, body: { error: { message: "invalid x-api-key " + API_KEY } } }) },
    () => { llmReply = () => Promise.reject(new Error("socket hang up at /home/claude/secret.ts " + API_KEY)) as never },
    () => { siteFailure = Object.assign(new Error("connect ECONNREFUSED 10.9.8.7:443 at /home/claude/x.ts"), { code: "ECONNREFUSED" }) },
  ]
  for (const setup of scenarios) {
    setup()
    const res = await post({ url: "https://example.com" })
    assert.doesNotMatch(res.text, /sk-ant|DO-NOT-LEAK|\/home\/claude|10\.9\.8\.7|\bat .*\.ts|stack/i)
  }
})

test("input: invalid URLs are rejected with 400 before any request", async () => {
  for (const body of [{}, { url: "" }, { url: "   " }, { url: 5 }, { url: "javascript:alert(1)" }, { url: "file:///etc/passwd" }, { url: "ftp://example.com" }, { url: "https://user:pw@example.com" }, { url: "x".repeat(3000) }, null, []]) {
    const res = await post(body)
    assert.equal(res.status, 400, JSON.stringify(body)?.slice(0, 60))
    assert.equal(res.json.success, false)
    assert.equal(res.json.code, "invalid_url")
    assert.ok(typeof res.json.error === "string" && res.json.error.length > 5)
  }
  assert.equal((await post(null, { raw: "{not json" })).status, 400)
  assert.equal((await post(null, { raw: "" })).status, 400)
  assert.equal((await post(null, { raw: JSON.stringify({ url: "https://example.com", pad: "x".repeat(10_000) }) })).status, 400)
  assert.equal(webRequests.length, 0)
  assert.equal(llmCalls.length, 0)
})

test("ssrf: localhost, private ranges, metadata endpoints and odd ports are refused with 400 - no request, no model call", async () => {
  const targets = [
    "http://localhost", "http://localhost:3000/api/seo", "http://127.0.0.1", "http://[::1]/", "http://0.0.0.0", "http://2130706433",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/", "http://metadata.google.internal/computeMetadata/v1/",
    "http://10.0.0.1", "http://172.16.0.5", "http://192.168.1.1/admin", "http://intranet", "http://db.internal", "https://example.com:8443", "https://example.com:22",
    "169.254.169.254", "localhost:3000",
  ]
  const { resetSeoRateLimit } = await import("../lib/seo/rate-limit")
  for (const url of targets) {
    resetSeoRateLimit() // many refusals in one test would otherwise hit the per-window allowance
    const res = await post({ url })
    assert.equal(res.status, 400, url)
    assert.equal(res.json.code, "blocked_url", url)
    assert.match(res.json.error, /private or internal|standard web ports/, url)
  }
  assert.equal(webRequests.length, 0, "no network request may be made for a refused address")
  assert.equal(llmCalls.length, 0)
})

test("ssrf: a redirect to an internal address is refused and the internal URL is never requested", async () => {
  site = fakeSite({ "/": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" }, body: "" } })
  const res = await post({ url: "https://example.com" })
  assert.equal(res.status, 400)
  assert.equal(res.json.code, "blocked_url")
  assert.deepEqual(webRequests, ["example.com/"])
  assert.equal(llmCalls.length, 0)
})

test("crawl failures: unreachable, refused, server errors, timeouts and non-HTML are explained", async () => {
  const cases: Array<[() => void, number, string, RegExp]> = [
    [() => { siteFailure = Object.assign(new Error("x"), { code: "ENOTFOUND" }) }, 422, "unreachable", /couldn't find that website/],
    [() => { siteFailure = Object.assign(new Error("x"), { code: "ECONNREFUSED" }) }, 422, "unreachable", /couldn't reach/],
    [() => { siteFailure = Object.assign(new Error("x"), { code: "CERT_HAS_EXPIRED" }) }, 422, "unreachable", /HTTPS certificate/],
    [() => { siteFailure = Object.assign(new Error("x"), { code: "ETIMEDOUT" }) }, 504, "timeout", /too long/],
    [() => { site = fakeSite({ "/": { status: 500, body: "boom" } }) }, 422, "unreachable", /server error.*500/],
    [() => { site = fakeSite({ "/": { status: 403, body: "no" } }) }, 422, "unreachable", /refused.*403/],
    [() => { site = fakeSite({ "/": { status: 404, body: "no" } }) }, 422, "unreachable", /404/],
    [() => { site = fakeSite({ "/": { headers: { "content-type": "application/pdf" }, body: "%PDF-1.4" } }) }, 422, "not_html", /web page/],
    [() => { site = fakeSite({ "/": { headers: { "content-type": "application/json" }, body: '{"a":1}' } }) }, 422, "not_html", /web page/],
  ]
  for (const [setup, status, code, message] of cases) {
    siteFailure = null
    site = healthySite()
    setup()
    const res = await post({ url: "https://example.com" })
    assert.equal(res.status, status, code + " " + message)
    assert.equal(res.json.code, code)
    assert.match(res.json.error, message)
  }
  assert.equal(llmCalls.length, 0, "the model is never called when the site could not be read")
})

test("crawl: malformed / hostile HTML does not crash the audit", async () => {
  site = fakeSite({
    "/": { body: "<html><head><title>Unclosed<meta name=description content='x'><body><h1>One<h1>Two<div><a href='http://[bad'>x</a><a href=''>y</a><img><script>{{{</script>" + "<div>".repeat(5000) },
    "/robots.txt": { status: 404, body: "" },
  })
  const res = await post({ url: "https://example.com" })
  assert.equal(res.status, 200)
  assert.equal(res.json.data.pagesCrawled.length, 1)
  assert.ok(res.json.data.issues.length > 0)
})

test("crawl: a huge page is capped, not loaded whole", async () => {
  site = fakeSite({ "/": { body: html({}) + "<!--" + "x".repeat(5_000_000) + "-->" } })
  const res = await post({ url: "https://example.com" })
  assert.equal(res.status, 200)
})

test("ai failures: the technical audit is still returned with a clear message (200)", async () => {
  const cases: Array<[() => void, RegExp]> = [
    [() => { llmReply = () => ({ status: 429, body: { error: "slow down" } }) }, /rate limit/],
    [() => { llmReply = () => ({ status: 503, body: {} }) }, /overloaded/],
    [() => { llmReply = () => ({ status: 401, body: { error: "bad key" } }) }, /credentials/],
    [() => { llmReply = () => ({ status: 200, body: { content: [{ type: "text", text: "I cannot help with that." }] } }) }, /couldn't be used/],
    [() => { llmReply = () => ({ status: 200, body: { content: [] } }) }, /couldn't be used/],
    [() => { llmReply = () => ({ status: 200, body: { content: [{ type: "text", text: "{\"llmActionPlan\": [" }] } }) }, /couldn't be used/],
    [() => { llmReply = () => Promise.reject(new Error("network down")) as never }, /unavailable/],
    [() => { delete process.env.ANTHROPIC_API_KEY }, /aren't set up/],
    [() => { process.env.SEO_LLM_PROVIDER = "unknown-provider" }, /aren't set up/],
  ]
  for (const [setup, message] of cases) {
    process.env.SEO_LLM_PROVIDER = "anthropic"
    process.env.ANTHROPIC_API_KEY = API_KEY
    const { resetSeoRateLimit } = await import("../lib/seo/rate-limit")
    resetSeoRateLimit()
    setup()
    const res = await post({ url: "https://example.com" })
    assert.equal(res.status, 200, String(message))
    assert.equal(res.json.success, true)
    assert.equal(res.json.data.ai.status, "unavailable", String(message))
    assert.match(res.json.data.ai.message, message)
    assert.equal(res.json.data.score, 100)
    assert.equal(res.json.data.pagesCrawled.length, 5)
    assert.ok(!res.json.data.ai.data)
  }
})

test("ai failures: truncated model output yields a partial result, not an error", async () => {
  const full = goodLlmJson()
  const cut = full.slice(0, full.indexOf('"llmPrioritizedRecommendations"') + 60)
  llmReply = () => ({ status: 200, body: { content: [{ type: "text", text: cut }] } })
  const res = await post({ url: "https://example.com" })
  assert.equal(res.status, 200)
  assert.equal(res.json.data.ai.status, "partial")
  assert.match(res.json.data.ai.message, /incomplete/)
  assert.ok(res.json.data.ai.data.keywordOpportunities.length > 0)
})

test("abuse limits: audits are rate-limited per window and the 429 is explained", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await post({ url: "http://localhost" })).status, 400)
  const limited = await post({ url: "https://example.com" })
  assert.equal(limited.status, 429)
  assert.equal(limited.json.code, "rate_limited")
  assert.equal(webRequests.length, 0)
  assert.equal(llmCalls.length, 0)
})

test("the unauthenticated check runs before anything else (no slot used, no body parsed)", async () => {
  for (let i = 0; i < 25; i++) assert.equal((await post({ url: "x" }, { auth: false })).status, 401)
  fakeCookies.clear()
  assert.equal((await post({ url: "https://example.com" })).status, 200, "401s must not consume the audit allowance")
})

test.after(() => {
  globalThis.fetch = realFetch
})
