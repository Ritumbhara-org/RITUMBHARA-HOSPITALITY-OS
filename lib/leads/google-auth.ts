// Google credentials for the Leads Sheet via Vercel OIDC + Google Workload Identity Federation. SERVER-ONLY.
//
// No service-account key exists anywhere. On each token refresh:
//   1. @vercel/oidc getVercelOidcToken() returns the short-lived OIDC token Vercel issues to this deployment.
//   2. google-auth-library's ExternalAccountClient exchanges it at Google STS for a federated token, using the
//      Workload Identity Pool provider that trusts this Vercel team's issuer.
//   3. That federated token impersonates the leads service account (roles/iam.workloadIdentityUser), which
//      returns an access token with the Sheets scope.
// google-auth-library caches the access token until shortly before it expires.
//
// Configuration comes from server-side environment variables (identifiers only, no secrets). Tokens and Google
// error bodies are never logged or returned; failures are logged as a stage name plus HTTP status / error code.

import { ExternalAccountClient, type BaseExternalAccountClient, type ExternalAccountClientOptions } from "google-auth-library"
import { getVercelOidcToken } from "@vercel/oidc"
import { SheetsRequestError, type AccessTokenSource } from "./google-sheets"

if (typeof window !== "undefined") {
  throw new Error("lib/leads/google-auth is server-only and must not be imported in browser code.")
}

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
const STS_TOKEN_URL = "https://sts.googleapis.com/v1/token"
const JWT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:jwt"

export interface WorkloadIdentityConfig {
  projectId: string
  projectNumber: string
  serviceAccountEmail: string
  poolId: string
  providerId: string
}

// The env var behind each setting, in the order they are reported when missing.
export const WORKLOAD_IDENTITY_ENV = {
  projectId: "GCP_PROJECT_ID",
  projectNumber: "GCP_PROJECT_NUMBER",
  serviceAccountEmail: "GCP_SERVICE_ACCOUNT_EMAIL",
  poolId: "GCP_WORKLOAD_IDENTITY_POOL_ID",
  providerId: "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
} as const

// Reads and validates the five GCP_* settings. Returns the names (never the values) of any missing or malformed.
export function readWorkloadIdentityConfig(
  env: Record<string, string | undefined>,
): { ok: true; config: WorkloadIdentityConfig } | { ok: false; missing: string[] } {
  const v = (k: keyof typeof WORKLOAD_IDENTITY_ENV) => String(env[WORKLOAD_IDENTITY_ENV[k]] || "").trim()
  const config: WorkloadIdentityConfig = {
    projectId: v("projectId"),
    projectNumber: v("projectNumber"),
    serviceAccountEmail: v("serviceAccountEmail"),
    poolId: v("poolId"),
    providerId: v("providerId"),
  }
  const valid: Record<keyof WorkloadIdentityConfig, boolean> = {
    projectId: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId),
    projectNumber: /^\d{6,20}$/.test(config.projectNumber),
    serviceAccountEmail: /^[a-z0-9][a-z0-9-]{4,62}@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(config.serviceAccountEmail),
    poolId: /^[a-z0-9-]{3,63}$/.test(config.poolId),
    providerId: /^[a-z0-9-]{3,63}$/.test(config.providerId),
  }
  const missing = (Object.keys(WORKLOAD_IDENTITY_ENV) as (keyof WorkloadIdentityConfig)[])
    .filter((k) => !valid[k])
    .map((k) => WORKLOAD_IDENTITY_ENV[k])
  return missing.length ? { ok: false, missing } : { ok: true, config }
}

// The external-account settings from Vercel's "Connect to Google Cloud" guide, scoped to Google Sheets.
export function externalAccountOptions(
  config: WorkloadIdentityConfig,
  getSubjectToken: () => Promise<string>,
): ExternalAccountClientOptions {
  return {
    type: "external_account",
    audience:
      "//iam.googleapis.com/projects/" + config.projectNumber +
      "/locations/global/workloadIdentityPools/" + config.poolId +
      "/providers/" + config.providerId,
    subject_token_type: JWT_TOKEN_TYPE,
    token_url: STS_TOKEN_URL,
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + config.serviceAccountEmail + ":generateAccessToken",
    scopes: [SHEETS_SCOPE],
    subject_token_supplier: { getSubjectToken },
  }
}

// Marks a failure to get the Vercel OIDC token itself (as opposed to Google rejecting the exchange).
class OidcUnavailableError extends Error {
  constructor() {
    super("vercel_oidc_unavailable")
    this.name = "OidcUnavailableError"
  }
}

// Safe diagnostics from a google-auth-library / gaxios error: HTTP status and a short error code, nothing else.
function errorDetail(err: unknown): { status?: number; code?: string } {
  const e = err as { status?: unknown; response?: { status?: unknown; data?: unknown } } | null
  const statusRaw = e && (e.response && e.response.status !== undefined ? e.response.status : e.status)
  const status = typeof statusRaw === "number" ? statusRaw : undefined
  const data = e && e.response ? (e.response.data as Record<string, unknown> | undefined) : undefined
  let code: unknown = data && data.error
  if (code && typeof code === "object") code = (code as { status?: unknown }).status
  return { status, code: typeof code === "string" && /^[A-Za-z_]{1,40}$/.test(code) ? code : undefined }
}

export interface TokenSourceDeps {
  getSubjectToken?: () => Promise<string>
  createClient?: (options: ExternalAccountClientOptions) => Pick<BaseExternalAccountClient, "getAccessToken"> | null
  log?: (event: string, detail: Record<string, unknown>) => void
}

// One client per configuration per server instance, so google-auth-library's token cache is reused.
const clients = new Map<string, Pick<BaseExternalAccountClient, "getAccessToken">>()

export function clearGoogleAuthCache() {
  clients.clear()
}

export function createWorkloadIdentityTokenSource(config: WorkloadIdentityConfig, deps: TokenSourceDeps = {}): AccessTokenSource {
  const key = [config.projectNumber, config.poolId, config.providerId, config.serviceAccountEmail].join("|")
  const log = deps.log || ((event, detail) => console.error("[leads] " + event, detail))
  const fetchOidc = deps.getSubjectToken || (() => getVercelOidcToken())
  const create = deps.createClient || ((options: ExternalAccountClientOptions) => ExternalAccountClient.fromJSON(options))

  const getSubjectToken = async () => {
    let token: unknown
    try {
      token = await fetchOidc()
    } catch {
      throw new OidcUnavailableError()
    }
    if (typeof token !== "string" || token.split(".").length !== 3) throw new OidcUnavailableError()
    return token
  }

  function client() {
    let c = clients.get(key)
    if (!c) {
      const made = create(externalAccountOptions(config, getSubjectToken))
      if (!made) throw new Error("external account client could not be created")
      // The project ID is informational for google-auth-library; no quota project header is sent.
      ;(made as { projectId?: string | null }).projectId = config.projectId
      c = made
      clients.set(key, c)
    }
    return c
  }

  return {
    async getAccessToken() {
      try {
        const res = await client().getAccessToken()
        if (!res || typeof res.token !== "string" || !res.token) throw new Error("empty access token")
        return res.token
      } catch (err) {
        clients.delete(key)
        // A token supplier failure can surface directly or wrapped by google-auth-library.
        const oidc = err instanceof OidcUnavailableError || (err as { cause?: unknown } | null)?.cause instanceof OidcUnavailableError ||
          (err instanceof Error && err.message.includes("vercel_oidc_unavailable"))
        if (oidc) {
          log("google_auth_failed", { stage: "vercel_oidc" })
          throw new SheetsRequestError(
            "The OS could not get its Vercel OIDC token, so it cannot sign in to Google. Check that OIDC Federation is enabled for this Vercel project (it is only available on Vercel deployments).",
            undefined,
            true,
          )
        }
        const detail = errorDetail(err)
        log("google_auth_failed", { stage: "google_token_exchange", ...detail })
        throw new SheetsRequestError(
          "Google rejected the OS's Workload Identity credentials. Check the GCP_* settings and that this Vercel environment is allowed to impersonate the service account.",
          undefined,
          true,
        )
      }
    },
    reset() {
      clients.delete(key)
    },
  }
}
