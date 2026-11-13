import { test } from "node:test"
import assert from "node:assert/strict"
import { ChannexClient, ChannexError, configFromEnv, type FetchLike } from "../lib/channex/client"

const cfg = { apiKey: "k-123", baseUrl: "https://staging.channex.io/api/v1" }
const reply = (status: number, body: unknown) => ({ status, text: async () => JSON.stringify(body) })

test("configFromEnv: no key means not configured; defaults to staging; trims trailing slash", () => {
  assert.equal(configFromEnv({}), null)
  assert.equal(configFromEnv({ CHANNEX_API_KEY: "  " }), null)
  assert.deepEqual(configFromEnv({ CHANNEX_API_KEY: "a" }), { apiKey: "a", baseUrl: "https://staging.channex.io/api/v1" })
  assert.equal(configFromEnv({ CHANNEX_API_KEY: "a", CHANNEX_BASE_URL: "https://app.channex.io/api/v1/" })?.baseUrl, "https://app.channex.io/api/v1")
})

test("sends the api key header, wraps the body, and unwraps the data envelope", async () => {
  const calls: any[] = []
  const f: FetchLike = async (url, init) => { calls.push({ url, init }); return reply(201, { data: { id: "uuid-1" } }) }
  const c = new ChannexClient(cfg, { fetch: f })
  const res = await c.createProperty({ title: "Villa" })
  assert.equal(res.data.id, "uuid-1")
  assert.equal(calls[0].url, "https://staging.channex.io/api/v1/properties")
  assert.equal(calls[0].init.headers["user-api-key"], "k-123")
  assert.deepEqual(JSON.parse(calls[0].init.body), { property: { title: "Villa" } })
})

test("restrictions read always carries filter[restrictions] (the API 400s without it)", async () => {
  let url = ""
  const c = new ChannexClient(cfg, { fetch: async (u) => { url = u; return reply(200, { data: {} }) } })
  await c.readRestrictions("P", "2026-12-01", "2026-12-07")
  assert.match(url, /filter%5Brestrictions%5D=rate%2Cmin_stay_arrival%2Cstop_sell/)
  assert.match(url, /filter%5Bproperty_id%5D=P/)
})

test("errors are normalized; details are optional; 4xx is not retried", async () => {
  let n = 0
  const c = new ChannexClient(cfg, { fetch: async () => { n++; return reply(401, { errors: { code: "unauthorized", title: "Unauthorized" } }) }, sleep: async () => {} })
  await assert.rejects(() => c.listProperties(), (e: any) => e instanceof ChannexError && e.status === 401 && /Unauthorized/.test(e.message))
  assert.equal(n, 1)
})

test("422 keeps its details", async () => {
  const c = new ChannexClient(cfg, { fetch: async () => reply(422, { errors: { code: "unprocessable_entity", details: "You not have access to requested group" } }) })
  await assert.rejects(() => c.createChannel({}), (e: any) => /requested group/.test(e.message))
})

test("5xx and network errors are retried a bounded number of times, then succeed or give up", async () => {
  let n = 0
  const flaky: FetchLike = async () => { n++; if (n === 1) throw new Error("socket hang up"); if (n === 2) return reply(503, {}); return reply(200, { data: [] }) }
  const ok = new ChannexClient(cfg, { fetch: flaky, sleep: async () => {} })
  assert.deepEqual((await ok.listProperties()).data, [])
  assert.equal(n, 3)

  let m = 0
  const dead = new ChannexClient(cfg, { fetch: async () => { m++; return reply(500, {}) }, retries: 2, sleep: async () => {} })
  await assert.rejects(() => dead.listProperties(), ChannexError)
  assert.equal(m, 3)
})

test("isProduction is false for staging and true for app.channex.io", () => {
  assert.equal(new ChannexClient(cfg).isProduction, false)
  assert.equal(new ChannexClient({ apiKey: "k", baseUrl: "https://app.channex.io/api/v1" }).isProduction, true)
})
