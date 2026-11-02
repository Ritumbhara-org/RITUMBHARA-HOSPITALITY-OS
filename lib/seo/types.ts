// Shared types for the Website SEO Audit module.
//
// Ported from the standalone Ritumbhara SEO Agent (studiosjaipur-pixel/ritumbhara-seo-agent). The split it
// established is kept on purpose: facts and rule-based checks come from code (crawler.ts, analyzer.ts); judgment
// and synthesis come from the LLM (llm.ts). The LLM never re-derives facts the code already knows.

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface HeadingNode {
  level: HeadingLevel
  text: string
}

export interface InternalLink {
  href: string // resolved, absolute URL
  anchorText: string
}

/** Raw facts extracted from one crawled page. No judgment applied. */
export interface PageFacts {
  url: string
  isHomepage: boolean
  fetchOk: boolean
  httpStatus: number | null
  title: string | null
  titleLength: number
  metaDescription: string | null
  metaDescriptionLength: number
  canonicalUrl: string | null
  noindex: boolean
  h1Text: string | null
  h1Count: number
  headingOutline: HeadingNode[]
  wordCount: number
  imageCount: number
  imagesMissingAlt: number
  internalLinkCount: number
  externalLinkCount: number
  internalLinks: InternalLink[]
  hasSchemaMarkup: boolean
  schemaTypes: string[]
}

export interface AuxFileFact {
  exists: boolean
  url: string
}

/** Output of the crawl step: raw facts only. */
export interface CrawlResult {
  requestedUrl: string
  crawledAt: string // ISO timestamp
  pages: PageFacts[]
  robotsTxt: AuxFileFact
  sitemapXml: AuxFileFact
}

export type IssueSeverity = "critical" | "high" | "medium" | "low"

/** One deterministic pass/fail check contributing to the score. */
export interface ScoreCheck {
  id: string
  check: string
  passed: boolean
  weight: number
  severity: IssueSeverity
  detail?: string
}

/** A failed deterministic check, expressed as something to fix. */
export interface SeoIssue {
  id: string
  title: string
  severity: IssueSeverity
  detail: string
  affectedUrls: string[]
  fix: string
}

/** Site-wide checks that compare pages with each other. */
export interface SiteChecks {
  robotsTxt: AuxFileFact
  sitemapXml: AuxFileFact
  duplicateTitles: string[][]
  duplicateMetaDescriptions: string[][]
  pagesMissingTitle: string[]
  pagesMissingMetaDescription: string[]
  pagesMissingH1: string[]
  pagesMultipleH1: string[]
  pagesNoindex: string[]
  pagesFailedToLoad: string[]
}

/** Output of analyzer.ts: deterministic facts, rule-based score and issues. No LLM. */
export interface DeterministicAudit {
  pageFacts: PageFacts[]
  siteChecks: SiteChecks
  score: number // 0-100
  scoreBreakdown: ScoreCheck[]
  issues: SeoIssue[]
}

// ---- LLM synthesis (validated JSON) ----

export type SearchIntent = "informational" | "navigational" | "transactional" | "local"
export type Priority = "high" | "medium" | "low"
export type RecommendationCategory =
  | "technical"
  | "on_page"
  | "content"
  | "local_seo"
  | "internal_linking"
  | "keywords"
export type ContentGapType =
  | "missing_page"
  | "thin_content"
  | "missing_location_coverage"
  | "missing_service_coverage"

export interface KeywordOpportunity {
  keyword: string
  intent: SearchIntent
  relevantPage: string | null
  rationale: string
}

export interface LocalSeoRecommendation {
  recommendation: string
  rationale: string
  priority: Priority
}

export interface MetaRecommendation {
  pageUrl: string
  currentTitle: string | null
  recommendedTitle: string
  currentMetaDescription: string | null
  recommendedMetaDescription: string
  rationale: string
}

export interface HeadingRecommendation {
  pageUrl: string
  issue: string
  recommendation: string
}

export interface ContentGap {
  topic: string
  gapType: ContentGapType
  rationale: string
  suggestedAction: string
}

export interface InternalLinkingSuggestion {
  fromPage: string
  toPage: string
  suggestedAnchorText: string
  rationale: string
}

export interface PrioritizedRecommendation {
  id: string
  title: string
  category: RecommendationCategory
  priorityScore: number // 0-100, the model's judgment; distinct from the deterministic score
  impact: Priority
  effort: Priority
  description: string
}

export interface ActionPlanStep {
  step: number
  title: string
  description: string
  relatedRecommendationIds: string[]
}

export interface LlmAuditSynthesis {
  keywordOpportunities: KeywordOpportunity[]
  keywordDisclaimer: string
  localSeoRecommendations: LocalSeoRecommendation[]
  metaRecommendations: MetaRecommendation[]
  headingRecommendations: HeadingRecommendation[]
  contentGaps: ContentGap[]
  internalLinkingSuggestions: InternalLinkingSuggestion[]
  prioritizedRecommendations: PrioritizedRecommendation[]
  actionPlan: ActionPlanStep[]
}

/**
 * State of the AI step. The deterministic audit is always returned; the AI step may be:
 *  - "ok":          every section came back and validated
 *  - "partial":     some sections were missing/malformed and were dropped (see `message`)
 *  - "unavailable": no usable AI output (provider down, rate limited, not configured, unusable response)
 */
export type AiStatus = "ok" | "partial" | "unavailable"

export interface SeoAuditResult {
  url: string
  crawledAt: string
  durationMs: number
  pagesCrawled: { url: string; isHomepage: boolean; ok: boolean }[]
  pageFacts: PageFacts[]
  siteChecks: SiteChecks
  score: number
  scoreBreakdown: ScoreCheck[]
  issues: SeoIssue[]
  ai: {
    status: AiStatus
    message?: string
    data?: LlmAuditSynthesis
  }
}

/** Business context passed into the LLM prompt. */
export interface BusinessContext {
  brandName: string
  industry: string
  model: string
  targetLocations: string[]
  competitiveNote: string
}

export const RITUMBHARA_BUSINESS_CONTEXT: BusinessContext = {
  brandName: "Ritumbhara",
  industry: "Luxury hospitality / villa and studio stays",
  model:
    "FOCO (Franchise-Owned, Company-Operated): asset owners own the property, Ritumbhara operates it and drives direct bookings.",
  targetLocations: ["Jaipur", "Alwar", "Sariska", "Jeerota", "Agra (upcoming market)"],
  competitiveNote:
    "An unrelated business, 'Ritumbhara Resort' (a wedding venue), competes for brand-name search visibility in Alwar, which can dilute or confuse search results for the hospitality brand.",
}
