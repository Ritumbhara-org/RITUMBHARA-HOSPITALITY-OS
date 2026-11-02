// Errors for the Website SEO Audit. Every SeoAuditError carries a message that is safe to show to the user
// (no stack traces, hostnames of internal services, keys or provider error bodies). Anything that is not a
// SeoAuditError is treated as an unexpected failure and reported with a generic message.

export type SeoErrorCode =
  | "invalid_url" // not a usable http(s) address
  | "blocked_url" // points at localhost / a private network / a metadata endpoint
  | "unreachable" // DNS failure, connection refused, TLS failure, non-2xx homepage
  | "timeout" // the site did not answer in time
  | "not_html" // the address did not return a web page
  | "rate_limited" // too many audits started recently
  | "busy" // too many audits already running
  | "internal"

export const SEO_ERROR_HTTP_STATUS: Record<SeoErrorCode, number> = {
  invalid_url: 400,
  blocked_url: 400,
  unreachable: 422,
  not_html: 422,
  timeout: 504,
  rate_limited: 429,
  busy: 429,
  internal: 500,
}

export class SeoAuditError extends Error {
  readonly code: SeoErrorCode
  constructor(code: SeoErrorCode, userMessage: string) {
    super(userMessage)
    this.name = "SeoAuditError"
    this.code = code
  }
}

export const isSeoAuditError = (e: unknown): e is SeoAuditError => e instanceof SeoAuditError
