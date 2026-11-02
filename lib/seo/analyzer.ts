// Deterministic SEO analysis for the Website SEO Audit. SERVER-ONLY (pure, no I/O, no LLM).
//
// Ported from the standalone Ritumbhara SEO Agent. Every check is a fact-check ("is the title missing", "is there
// more than one H1"), not a judgment call; judgment belongs in llm.ts. This keeps the score reproducible and
// independent of any model.
//
// Added on top of the agent's 14 weighted checks:
//   - `severity` on every check, so failures can be shown as critical / high / medium / low issues,
//   - a "noindex" check (a page telling search engines not to index it is the classic critical SEO failure),
//   - an issue-only list item for internal pages that returned an HTTP error (not part of the score).

import type { CrawlResult, DeterministicAudit, IssueSeverity, PageFacts, ScoreCheck, SeoIssue, SiteChecks } from "./types"

export const TITLE_MIN = 30
export const TITLE_MAX = 60
export const META_DESC_MIN = 70
export const META_DESC_MAX = 160
export const THIN_CONTENT_WORD_COUNT = 300

function groupDuplicates(pages: PageFacts[], field: "title" | "metaDescription"): string[][] {
  const map = new Map<string, string[]>()
  for (const page of pages) {
    const value = page[field]
    if (!value) continue // missing values are tracked separately, not as duplicates
    const key = value.trim().toLowerCase()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(page.url)
  }
  return Array.from(map.values()).filter((urls) => urls.length > 1)
}

function buildSiteChecks(crawl: CrawlResult): SiteChecks {
  const { pages } = crawl
  const ok = pages.filter((p) => p.fetchOk)
  return {
    robotsTxt: crawl.robotsTxt,
    sitemapXml: crawl.sitemapXml,
    duplicateTitles: groupDuplicates(ok, "title"),
    duplicateMetaDescriptions: groupDuplicates(ok, "metaDescription"),
    pagesMissingTitle: ok.filter((p) => !p.title).map((p) => p.url),
    pagesMissingMetaDescription: ok.filter((p) => !p.metaDescription).map((p) => p.url),
    pagesMissingH1: ok.filter((p) => p.h1Count === 0).map((p) => p.url),
    pagesMultipleH1: ok.filter((p) => p.h1Count > 1).map((p) => p.url),
    pagesNoindex: ok.filter((p) => p.noindex).map((p) => p.url),
    pagesFailedToLoad: pages.filter((p) => !p.fetchOk).map((p) => p.url),
  }
}

interface CheckDef {
  id: string
  check: string
  weight: number
  severity: IssueSeverity
  passed: boolean
  detail?: string
  /** Pages (or files) the problem affects - becomes the issue's affected list. */
  affected: string[]
  fix: string
}

function buildChecks(crawl: CrawlResult, site: SiteChecks): CheckDef[] {
  const ok = crawl.pages.filter((p) => p.fetchOk)
  const n = Math.max(ok.length, 1)
  const urls = (pred: (p: PageFacts) => boolean) => ok.filter(pred).map((p) => p.url)

  const titleOut = urls((p) => p.titleLength < TITLE_MIN || p.titleLength > TITLE_MAX)
  const metaOut = urls((p) => p.metaDescriptionLength < META_DESC_MIN || p.metaDescriptionLength > META_DESC_MAX)
  const missingAlt = ok.reduce((s, p) => s + p.imagesMissingAlt, 0)
  const totalImages = ok.reduce((s, p) => s + p.imageCount, 0)
  const thin = urls((p) => p.wordCount < THIN_CONTENT_WORD_COUNT)
  const withSchema = ok.filter((p) => p.hasSchemaMarkup).length
  const noCanonical = urls((p) => !p.canonicalUrl)
  const noInternal = urls((p) => p.internalLinkCount === 0)
  const h1Problem = [...site.pagesMissingH1, ...site.pagesMultipleH1]

  return [
    { id: "robots_txt", check: "robots.txt is present", weight: 5, severity: "medium", passed: site.robotsTxt.exists, affected: [site.robotsTxt.url],
      fix: "Add a robots.txt at the site root that allows crawling and points to the sitemap." },
    { id: "sitemap_xml", check: "sitemap.xml is present", weight: 5, severity: "medium", passed: site.sitemapXml.exists, affected: [site.sitemapXml.url],
      fix: "Publish an XML sitemap at /sitemap.xml and submit it in Google Search Console." },
    { id: "indexable", check: "No page is blocked from indexing (noindex)", weight: 10, severity: "critical", passed: site.pagesNoindex.length === 0,
      detail: `${site.pagesNoindex.length}/${n} pages have a noindex tag`, affected: site.pagesNoindex,
      fix: "Remove the noindex robots meta tag from pages that should appear in search results." },
    { id: "title_present", check: "All crawled pages have a <title> tag", weight: 10, severity: "critical", passed: site.pagesMissingTitle.length === 0,
      detail: `${site.pagesMissingTitle.length}/${n} pages missing a title`, affected: site.pagesMissingTitle,
      fix: "Give every page a unique, descriptive <title> that includes the page topic and location." },
    { id: "meta_present", check: "All crawled pages have a meta description", weight: 10, severity: "high", passed: site.pagesMissingMetaDescription.length === 0,
      detail: `${site.pagesMissingMetaDescription.length}/${n} pages missing a meta description`, affected: site.pagesMissingMetaDescription,
      fix: "Write a unique meta description for each page that summarises it and invites the click." },
    { id: "title_unique", check: "No duplicate <title> tags across crawled pages", weight: 8, severity: "high", passed: site.duplicateTitles.length === 0,
      detail: `${site.duplicateTitles.length} duplicate group(s) found`, affected: site.duplicateTitles.flat(),
      fix: "Make each page's title unique so search engines can tell the pages apart." },
    { id: "meta_unique", check: "No duplicate meta descriptions across crawled pages", weight: 6, severity: "medium", passed: site.duplicateMetaDescriptions.length === 0,
      detail: `${site.duplicateMetaDescriptions.length} duplicate group(s) found`, affected: site.duplicateMetaDescriptions.flat(),
      fix: "Rewrite repeated meta descriptions so each page has its own." },
    { id: "single_h1", check: "Every crawled page has exactly one H1", weight: 10, severity: "high", passed: h1Problem.length === 0,
      detail: `${site.pagesMissingH1.length} missing H1, ${site.pagesMultipleH1.length} with multiple H1s`, affected: h1Problem,
      fix: "Use exactly one H1 per page that states the page's main topic; use H2/H3 for sub-sections." },
    { id: "title_length", check: `Title length within ${TITLE_MIN}-${TITLE_MAX} characters`, weight: 8, severity: "medium", passed: titleOut.length === 0,
      detail: `${ok.length - titleOut.length}/${n} pages in range`, affected: titleOut,
      fix: `Keep titles between ${TITLE_MIN} and ${TITLE_MAX} characters so they aren't cut off or too thin.` },
    { id: "meta_length", check: `Meta description length within ${META_DESC_MIN}-${META_DESC_MAX} characters`, weight: 6, severity: "low", passed: metaOut.length === 0,
      detail: `${ok.length - metaOut.length}/${n} pages in range`, affected: metaOut,
      fix: `Keep meta descriptions between ${META_DESC_MIN} and ${META_DESC_MAX} characters.` },
    { id: "image_alt", check: "Images have alt text", weight: 8, severity: "medium", passed: missingAlt === 0,
      detail: totalImages > 0 ? `${missingAlt}/${totalImages} images missing alt text` : "No images found", affected: urls((p) => p.imagesMissingAlt > 0),
      fix: "Add short, descriptive alt text to every meaningful image." },
    { id: "thin_content", check: `No thin-content pages (under ${THIN_CONTENT_WORD_COUNT} words)`, weight: 8, severity: "medium", passed: thin.length === 0,
      detail: `${thin.length}/${n} pages under threshold`, affected: thin,
      fix: "Expand thin pages with useful, specific content (rooms, location, amenities, FAQs)." },
    { id: "schema", check: "Structured data (schema.org) present", weight: 6, severity: "medium", passed: withSchema > 0,
      detail: `${withSchema}/${n} pages have schema markup`, affected: withSchema > 0 ? [] : ok.map((p) => p.url),
      fix: "Add schema.org JSON-LD (e.g. Hotel/LodgingBusiness, FAQPage) so search engines understand the property." },
    { id: "canonical", check: "Canonical tag present", weight: 5, severity: "low", passed: noCanonical.length === 0,
      detail: `${ok.length - noCanonical.length}/${n} pages have a canonical tag`, affected: noCanonical,
      fix: "Add a rel=canonical link to each page to avoid duplicate-URL confusion." },
    { id: "internal_links", check: "Pages contain internal links", weight: 5, severity: "low", passed: noInternal.length === 0,
      detail: `${ok.length - noInternal.length}/${n} pages have at least one internal link`, affected: noInternal,
      fix: "Link each page to related pages on the site so visitors and crawlers can move around." },
  ]
}

function buildIssues(checks: CheckDef[], crawl: CrawlResult): SeoIssue[] {
  const issues: SeoIssue[] = checks
    .filter((c) => !c.passed)
    .map((c) => ({
      id: c.id,
      title: c.check,
      severity: c.severity,
      detail: c.detail ?? "",
      affectedUrls: Array.from(new Set(c.affected)).slice(0, 20),
      fix: c.fix,
    }))

  // Internal pages that answered with an HTTP error (a broken link on the site). Not part of the score; crawl
  // failures without a status (timeouts) and access refusals (401/403/429) are not reported as SEO issues.
  const broken = crawl.pages.filter((p) => !p.fetchOk && !p.isHomepage && p.httpStatus !== null && p.httpStatus >= 400 && ![401, 403, 429].includes(p.httpStatus))
  if (broken.length > 0) {
    issues.push({
      id: "broken_internal_pages",
      title: "Internal links lead to pages that return an error",
      severity: "high",
      detail: `${broken.length} linked page(s) returned an HTTP error`,
      affectedUrls: broken.map((p) => p.url).slice(0, 20),
      fix: "Fix or remove the links to these pages, or restore the pages.",
    })
  }

  const rank: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity])
}

function computeScore(checks: ScoreCheck[]): number {
  const total = checks.reduce((s, c) => s + c.weight, 0)
  const earned = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0)
  return total === 0 ? 0 : Math.round((earned / total) * 100)
}

/** Runs every deterministic check against a CrawlResult. Pure function. */
export function runDeterministicAudit(crawl: CrawlResult): DeterministicAudit {
  const siteChecks = buildSiteChecks(crawl)
  const defs = buildChecks(crawl, siteChecks)
  const scoreBreakdown: ScoreCheck[] = defs.map(({ id, check, passed, weight, severity, detail }) => ({ id, check, passed, weight, severity, detail }))
  return {
    pageFacts: crawl.pages,
    siteChecks,
    score: computeScore(scoreBreakdown),
    scoreBreakdown,
    issues: buildIssues(defs, crawl),
  }
}
