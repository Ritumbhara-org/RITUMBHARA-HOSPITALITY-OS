// Orchestrator for the Website SEO Audit. SERVER-ONLY.
//
//   URL -> crawl (safe-fetch.ts) -> deterministic audit (analyzer.ts) -> AI synthesis (llm.ts) -> result
//
// The deterministic audit is always returned. If the AI step fails for ANY reason (provider down, rate limit,
// missing key, unusable output) the result still carries the full technical audit plus an honest `ai.message`;
// the request does not fail. Only problems with the address itself or the website (invalid, blocked, unreachable,
// timeout) throw a SeoAuditError.

import { runDeterministicAudit } from "./analyzer"
import { crawlWebsite, type CrawlDeps } from "./crawler"
import { LlmError, describeLlmFailure, getLlmProvider, type LlmProvider } from "./llm-provider"
import { generateLlmSynthesis } from "./llm"
import { normalizeInputUrl } from "./url-safety"
import { RITUMBHARA_BUSINESS_CONTEXT, type SeoAuditResult } from "./types"

// The API route allows 60 s. Crawl <= ~22 s (+ ~5.5 s for robots/sitemap), AI <= 25 s, leaving a few seconds spare.
const TOTAL_BUDGET_MS = 55_000
const MAX_AI_MS = 25_000
const MIN_AI_MS = 8_000

export interface AuditDeps {
  crawl?: CrawlDeps
  /** Replace the model provider (tests). Production resolves it from environment variables. */
  provider?: LlmProvider
}

export async function runSeoAudit(inputUrl: string, deps: AuditDeps = {}): Promise<SeoAuditResult> {
  const startedAt = Date.now()

  // Throws SeoAuditError for invalid / blocked / unreachable / timed-out websites.
  const crawl = await crawlWebsite(normalizeInputUrl(inputUrl), deps.crawl)
  const audit = runDeterministicAudit(crawl)

  let ai: SeoAuditResult["ai"]
  try {
    const provider = deps.provider ?? getLlmProvider()
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt)
    const timeoutMs = Math.max(MIN_AI_MS, Math.min(MAX_AI_MS, remaining))
    const res = await generateLlmSynthesis(audit, RITUMBHARA_BUSINESS_CONTEXT, { provider, timeoutMs })
    ai = { status: res.status, message: res.message, data: res.data }
  } catch (err) {
    // Server log carries only the failure kind - never the provider's response body or any key.
    console.error("[seo-audit] AI step failed:", err instanceof LlmError ? err.kind : "unexpected")
    ai = { status: "unavailable", message: describeLlmFailure(err) }
  }

  return {
    url: crawl.requestedUrl,
    crawledAt: crawl.crawledAt,
    durationMs: Date.now() - startedAt,
    pagesCrawled: crawl.pages.map((p) => ({ url: p.url, isHomepage: p.isHomepage, ok: p.fetchOk })),
    pageFacts: audit.pageFacts,
    siteChecks: audit.siteChecks,
    score: audit.score,
    scoreBreakdown: audit.scoreBreakdown,
    issues: audit.issues,
    ai,
  }
}
