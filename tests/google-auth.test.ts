// Vercel OIDC -> Google Workload Identity Federation token source for the Leads Sheet (lib/leads/google-auth.ts).
// The REAL google-auth-library ExternalAccountClient runs here; only its HTTP transport is pointed at an in-memory
// fake of Google STS and the IAM Credentials API, and the Vercel OIDC token is a test value.
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { Gaxios } from "gaxios"
import { ExternalAccountClient, type ExternalAccountClientOptions } from "google-auth-library"
import {
  clearGoogleAuthCache, createWorkloadIdentityTokenSource, externalAccountOptions, SHEETS_SCOPE, type WorkloadIdentityConfig,
} from "../lib/leads/google-auth"
import { SheetsRequestError } from "../lib/leads/google-sheets"

const WIF: WorkloadIdentityConfig = {
  projectId: "ritumbhara-test-project",
  projectNumber: "123456789012",
  serviceAccountEmail: "leads@ritumbhara-test-project.iam.gserviceaccount.com",
  poolId: "vercel",
  providerId: "vercel",
}
const AUDIENCE = "//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel/providers/vercel"
const IAM_URL = "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/leads@ritumbhara-test-project.iam.gserviceaccount.com:generateAccessToken"
const OIDC_TOKEN = "eyJvidc.vercel-oidc-SECRET-subject.sig"
const STS_TOKEN = "sts-federated-SECRET-token"
const SHEETS_TOKEN = "ya29.sheets-SECRET-access-token"

interface Seen { url: string; body: string; auth: string }

// Fake Google STS + IAM Credentials endpoints behind gaxios.
function fakeGoogle(opts: { stsStatus?: number; iamStatus?: number } = {}) {
  const seen: Seen[] = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    const rawBody = init && init.body
    const body = typeof rawBody === "string" ? rawBody : rawBody instanceof URLSearchParams ? rawBody.toString() : rawBody ? String(rawBody) : ""
    const auth = new Headers((init && init.headers) || {}).get("authorization") || ""
    seen.push({ url, body, auth })
    if (url === "https://sts.googleapis.com/v1/token") {
      if (opts.stsStatus) return Response.json({ error: "invalid_grant", error_description: "detail " + OIDC_TOKEN }, { status: opts.stsStatus })
      return Response.json({ access_token: STS_TOKEN, issued_token_type: "urn:ietf:params:oauth:token-type:access_token", token_type: "Bearer", expires_in: 3600 })
    }
    if (url === IAM_URL) {
      if (opts.iamStatus) return Response.json({ error: { code: opts.iamStatus, message: "denied " + STS_TOKEN, status: "PERMISSION_DENIED" } }, { status: opts.iamStatus })
      return Response.json({ accessToken: SHEETS_TOKEN, expireTime: new Date(Date.now() + 3600000).toISOString() })
    }
    return new Response("{}", { status: 404 })
  }
  const created: ExternalAccountClientOptions[] = []
  // The real client, with its HTTP transport (including the STS exchange's) pointed at the fake.
  const createClient = (options: ExternalAccountClientOptions) => {
    created.push(options)
    const client = ExternalAccountClient.fromJSON(options)
    assert.ok(client)
    const transporter = new Gaxios({ fetchImplementation: fetchImpl as never })
    client.transporter = transporter
    ;(client as unknown as { stsCredential: { transporter: Gaxios } }).stsCredential.transporter = transporter
    return client
  }
  return { seen, created, createClient }
}

beforeEach(() => clearGoogleAuthCache())

test("external account settings follow Vercel's Google Cloud guide, scoped to Sheets, with no key or secret", () => {
  const getSubjectToken = async () => OIDC_TOKEN
  const o = externalAccountOptions(WIF, getSubjectToken) as unknown as Record<string, unknown>
  assert.equal(o.type, "external_account")
  assert.equal(o.audience, AUDIENCE)
  assert.equal(o.subject_token_type, "urn:ietf:params:oauth:token-type:jwt")
  assert.equal(o.token_url, "https://sts.googleapis.com/v1/token")
  assert.equal(o.service_account_impersonation_url, IAM_URL)
  assert.deepEqual(o.scopes, [SHEETS_SCOPE])
  assert.equal((o.subject_token_supplier as { getSubjectToken: unknown }).getSubjectToken, getSubjectToken)
  assert.equal(o.quota_project_id, undefined)
  assert.doesNotMatch(JSON.stringify(o), /private_key|client_secret|credential_source/)
})

test("exchanges the Vercel OIDC token at Google STS, impersonates the service account, and returns a Sheets token", async () => {
  const g = fakeGoogle()
  const logged: unknown[] = []
  const source = createWorkloadIdentityTokenSource(WIF, { getSubjectToken: async () => OIDC_TOKEN, createClient: g.createClient, log: (e, d) => logged.push([e, d]) })
  assert.equal(await source.getAccessToken(), SHEETS_TOKEN)

  const [sts, iam] = g.seen
  assert.equal(sts.url, "https://sts.googleapis.com/v1/token")
  const form = new URLSearchParams(sts.body)
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange")
  assert.equal(form.get("audience"), AUDIENCE)
  assert.equal(form.get("subject_token"), OIDC_TOKEN)
  assert.equal(form.get("subject_token_type"), "urn:ietf:params:oauth:token-type:jwt")

  assert.equal(iam.url, IAM_URL)
  assert.equal(iam.auth, "Bearer " + STS_TOKEN)
  assert.deepEqual(JSON.parse(iam.body).scope, [SHEETS_SCOPE])
  assert.deepEqual(logged, [])

  // The token is cached by google-auth-library and the client is reused: no second exchange.
  assert.equal(await source.getAccessToken(), SHEETS_TOKEN)
  assert.equal(await createWorkloadIdentityTokenSource(WIF, { getSubjectToken: async () => OIDC_TOKEN, createClient: g.createClient }).getAccessToken(), SHEETS_TOKEN)
  assert.equal(g.seen.length, 2)
  assert.equal(g.created.length, 1)
})

test("no Vercel OIDC token (e.g. not running on Vercel): clear server-side error, Google is never called", async () => {
  for (const supplier of [async () => { throw new Error("The 'x-vercel-oidc-token' header is missing " + OIDC_TOKEN) }, async () => "", async () => "not-a-jwt"]) {
    clearGoogleAuthCache()
    const g = fakeGoogle()
    const logged: [string, Record<string, unknown>][] = []
    const source = createWorkloadIdentityTokenSource(WIF, { getSubjectToken: supplier, createClient: g.createClient, log: (e, d) => logged.push([e, d]) })
    await assert.rejects(source.getAccessToken(), (err: unknown) => {
      assert.ok(err instanceof SheetsRequestError)
      assert.equal(err.auth, true)
      assert.equal(err.status, undefined)
      assert.match(err.message, /Vercel OIDC token/)
      assert.doesNotMatch(err.message, /SECRET/)
      return true
    })
    assert.equal(g.seen.length, 0)
    assert.deepEqual(logged, [["google_auth_failed", { stage: "vercel_oidc" }]])
  }
})

test("Google STS rejecting the token: auth error with status and error code logged, never tokens or bodies", async () => {
  const g = fakeGoogle({ stsStatus: 400 })
  const logged: [string, Record<string, unknown>][] = []
  const source = createWorkloadIdentityTokenSource(WIF, { getSubjectToken: async () => OIDC_TOKEN, createClient: g.createClient, log: (e, d) => logged.push([e, d]) })
  await assert.rejects(source.getAccessToken(), (err: unknown) => {
    assert.ok(err instanceof SheetsRequestError)
    assert.equal(err.auth, true)
    assert.match(err.message, /Workload Identity credentials/)
    assert.doesNotMatch(err.message, /SECRET|invalid_grant/)
    return true
  })
  assert.deepEqual(logged, [["google_auth_failed", { stage: "google_token_exchange", status: 400, code: "invalid_grant" }]])
  assert.doesNotMatch(JSON.stringify(logged), /SECRET/)
})

test("service account impersonation denied (missing roles/iam.workloadIdentityUser): auth error, 403 logged", async () => {
  const g = fakeGoogle({ iamStatus: 403 })
  const logged: [string, Record<string, unknown>][] = []
  const source = createWorkloadIdentityTokenSource(WIF, { getSubjectToken: async () => OIDC_TOKEN, createClient: g.createClient, log: (e, d) => logged.push([e, d]) })
  await assert.rejects(source.getAccessToken(), (err: unknown) => err instanceof SheetsRequestError && err.auth === true && err.status === undefined)
  assert.equal(logged.length, 1)
  assert.equal(logged[0][1].stage, "google_token_exchange")
  assert.equal(logged[0][1].status, 403)
  assert.equal(logged[0][1].code, "PERMISSION_DENIED")
  assert.doesNotMatch(JSON.stringify(logged), /SECRET/)
})

test("reset() and failures drop the cached client so the next call starts a fresh exchange", async () => {
  const g = fakeGoogle()
  const source = createWorkloadIdentityTokenSource(WIF, { getSubjectToken: async () => OIDC_TOKEN, createClient: g.createClient })
  await source.getAccessToken()
  source.reset!()
  await source.getAccessToken()
  assert.equal(g.created.length, 2)
  assert.equal(g.seen.filter((s) => s.url.includes("sts.googleapis.com")).length, 2)
})

test("the real ExternalAccountClient accepts the settings and records the project ID (no quota project header)", async () => {
  type Client = NonNullable<ReturnType<typeof ExternalAccountClient.fromJSON>> & { quotaProjectId?: string }
  const holder: { made?: Client } = {}
  const source = createWorkloadIdentityTokenSource(WIF, {
    getSubjectToken: async () => OIDC_TOKEN,
    createClient: (o) => {
      const c = ExternalAccountClient.fromJSON(o)
      assert.ok(c)
      c.getAccessToken = async () => ({ token: "t" })
      holder.made = c
      return c
    },
  })
  assert.equal(await source.getAccessToken(), "t")
  const client = holder.made
  assert.ok(client)
  assert.equal(client.projectId, WIF.projectId)
  assert.equal(client.quotaProjectId, undefined)
  assert.deepEqual(client.scopes, [SHEETS_SCOPE])
})
