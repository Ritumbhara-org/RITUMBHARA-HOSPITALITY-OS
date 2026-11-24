// Crawler for the Website SEO Audit. SERVER-ONLY.
//
// Responsibility: fetch pages and extract RAW FACTS from the HTML. No SEO judgment (analyzer.ts) and no LLM calls
// (llm.ts) happen here. Ported from the standalone Ritumbhara SEO Agent; the strategy is unchanged:
//   1. fetch the homepage,
//   2. take same-site internal links from it,
//   3. fetch up to 4 more pages (5 total), preferring content pages over utility pages. No deeper discovery.
// What changed from the agent: all network access goes through safe-fetch.ts (SSRF protection, size and time
// limits), and the fetchers are injectable so the crawl logic can be tested without a network.

import * as cheerio from "cheerio"
import { SeoAuditError, type SeoErrorCode } from "./errors"
import { safeFetch } from "./safe-fetch"
import { isSameSite, validateTargetUrl } from "./url-safety"
import type { AuxFileFact, CrawlResult, HeadingNode, InternalLink, PageFacts } from "./types"

export const MAX_PAGES = 5
export const CRAWL_BUDGET_MS = 22_000 // whole crawl, all pages
const PAGE_TIMEOUT_MS = 8_000
const AUX_TIMEOUT_MS = 5_000
const AUX_MAX_BYTES = 100_000

// Per-field caps keep the API response and the LLM prompt a predictable size no matter what a site serves.
const MAX_TITLE_CHARS = 300
const MAX_META_CHARS = 600
const MAX_HEADING_CHARS = 200
const MAX_HEADINGS = 60
const MAX_INTERNAL_LINKS = 100

// Links whose path contains any of these are deprioritized when choosing which pages to crawl.
const LOW_VALUE_PATH_HINTS = ["privacy", "terms", "cookie", "login", "signin", "sign-in", "cart", "checkout", "account", "wp-admin", "wp-login"]
const NON_PAGE_EXTENSION = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|rar|css|js|mjs|map|mp4|mp3|mov|avi|xml|json|txt|docx?|xlsx?|pptx?)$/i

export interface FetchedPage {
  url: string // final URL after redirects
  ok: boolean
  status: number | null
  html: string | null
  errorCode?: SeoErrorCode
  errorMessage?: string
}

export interface CrawlDeps {
  /** Fetches one HTML page. Must never throw; failures are reported in the result. */
  fetchPage?: (url: string, deadline: number) => Promise<FetchedPage>
  /** Checks whether robots.txt / sitemap.xml exists. Must never throw. */
  fetchAux?: (url: string, kind: "robots" | "sitemap", deadline: number) => Promise<boolean>
}

const looksLikeHtml = (contentType: string, body: string) =>
  /html|xml/i.test(contentType) || /^\s*(<!doctype html|<html)/i.test(body.slice(0, 200))

export const defaultFetchPage: NonNullable<CrawlDeps["fetchPage"]> = async (url, deadline) => {
  try {
    const res = await safeFetch(url, { timeoutMs: PAGE_TIMEOUT_MS, deadline })
    if (res.status < 200 || res.status >= 300) {
      return { url: res.url, ok: false, status: res.status, html: null }
    }
    if (!looksLikeHtml(res.contentType, res.body)) {
      return { url: res.url, ok: false, status: res.status, html: null, errorCode: "not_html", errorMessage: "That address didn't return a web page." }
    }
    return { url: res.url, ok: true, status: res.status, html: res.body }
  } catch (err) {
    const e = err instanceof SeoAuditError ? err : null
    return { url, ok: false, status: null, html: null, errorCode: e?.code ?? "unreachable", errorMessage: e?.message ?? "We couldn't reach that website." }
  }
}

export const defaultFetchAux: NonNullable<CrawlDeps["fetchAux"]> = async (url, kind, deadline) => {
  try {
    const res = await safeFetch(url, { timeoutMs: AUX_TIMEOUT_MS, maxBytes: AUX_MAX_BYTES, deadline, accept: "text/plain,application/xml,text/xml,*/*;q=0.5" })
    if (res.status !== 200) return false
    const body = res.body.slice(0, 4000).toLowerCase()
    // A "soft 404" returns an HTML page with status 200 - don't count that as the file existing.
    if (kind === "robots") return !/<html|<!doctype/.test(body) && /user-agent|disallow|allow|sitemap/.test(body)
    return /<urlset|<sitemapindex/.test(body)
  } catch {
    return false
  }
}

function normalizeUrl(raw: string): string {
  const u = new URL(raw)
  u.hash = ""
  return u.toString()
}

function scorePathValue(pathname: string): number {
  const lower = pathname.toLowerCase()
  if (LOW_VALUE_PATH_HINTS.some((hint) => lower.includes(hint))) return -1
  const depth = lower.split("/").filter(Boolean).length
  return depth <= 2 ? 2 : 1
}

function resolveInternal(href: string | undefined, pageUrl: string, siteUrl: string): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith("#") || /^(mailto|tel|sms|javascript|data):/i.test(trimmed)) return null
  let abs: URL
  try {
    abs = new URL(trimmed, pageUrl)
  } catch {
    return null
  }
  if (abs.protocol !== "http:" && abs.protocol !== "https:") return null
  if (!isSameSite(abs, siteUrl)) return null
  return normalizeUrl(abs.toString())
}

function discoverInternalLinks(html: string, pageUrl: string, siteUrl: string): string[] {
  const $ = cheerio.load(html)
  const found = new Set<string>()
  $("a[href]").each((_, el) => {
    const abs = resolveInternal($(el).attr("href"), pageUrl, siteUrl)
    if (!abs) return
    let u: URL
    try {
      u = new URL(abs)
    } catch {
      return
    }
    if (NON_PAGE_EXTENSION.test(u.pathname)) return
    if (u.port && u.port !== "80" && u.port !== "443") return
    found.add(abs)
  })
  found.delete(normalizeUrl(pageUrl))
  return Array.from(found).sort((a, b) => scorePathValue(new URL(b).pathname) - scorePathValue(new URL(a).pathname))
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim()

function extractHeadingOutline($: cheerio.CheerioAPI): HeadingNode[] {
  const outline: HeadingNode[] = []
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    if (outline.length >= MAX_HEADINGS) return
    const tag = String((el as unknown as { tagName?: string; name?: string }).tagName ?? (el as { name?: string }).name ?? "")
    const level = Number(tag.replace(/[^0-9]/g, "")) as HeadingNode["level"]
    const text = clean($(el).text()).slice(0, MAX_HEADING_CHARS)
    if (text && level >= 1 && level <= 6) outline.push({ level, text })
  })
  return outline
}

function extractSchemaTypes($: cheerio.CheerioAPI): string[] {
  const types = new Set<string>()
  const collect = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(collect)
    if (!node || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    const t = obj["@type"]
    if (typeof t === "string") types.add(t)
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x))
    if (obj["@graph"]) collect(obj["@graph"])
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collect(JSON.parse($(el).contents().text()))
    } catch {
      // Malformed JSON-LD: ignore rather than fail the crawl.
    }
  })
  return Array.from(types).slice(0, 20)
}

function emptyFacts(url: string, isHomepage: boolean, status: number | null): PageFacts {
  return {
    url, isHomepage, fetchOk: false, httpStatus: status,
    title: null, titleLength: 0, metaDescription: null, metaDescriptionLength: 0, canonicalUrl: null, noindex: false,
    h1Text: null, h1Count: 0, headingOutline: [], wordCount: 0, imageCount: 0, imagesMissingAlt: 0,
    internalLinkCount: 0, externalLinkCount: 0, internalLinks: [], hasSchemaMarkup: false, schemaTypes: [],
  }
}

export function extractPageFacts(fetched: FetchedPage, isHomepage: boolean, siteUrl: string): PageFacts {
  if (!fetched.ok || !fetched.html) return emptyFacts(fetched.url, isHomepage, fetched.status)
  const url = fetched.url
  const $ = cheerio.load(fetched.html)

  const title = clean($("title").first().text()).slice(0, MAX_TITLE_CHARS) || null
  const metaDescription = clean($('meta[name="description"]').first().attr("content") ?? "").slice(0, MAX_META_CHARS) || null
  const canonicalUrl = $('link[rel="canonical"]').first().attr("href")?.trim().slice(0, 500) || null

  let noindex = false
  $("meta[name]").each((_, el) => {
    const name = ($(el).attr("name") ?? "").toLowerCase()
    if ((name === "robots" || name === "googlebot") && /noindex/i.test($(el).attr("content") ?? "")) noindex = true
  })

  const h1Elements = $("h1")
  const h1Text = clean(h1Elements.first().text()).slice(0, MAX_HEADING_CHARS) || null

  // Count visible words only: scripts, styles and templates are not content.
  const body = $("body").clone()
  body.find("script, style, noscript, template, svg").remove()
  const bodyText = clean(body.text())
  const wordCount = bodyText ? bodyText.split(" ").length : 0

  const images = $("img")
  let imagesMissingAlt = 0
  images.each((_, el) => {
    if (!($(el).attr("alt") ?? "").trim()) imagesMissingAlt += 1
  })

  const internal: InternalLink[] = []
  let internalCount = 0
  let externalCount = 0
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim()
    if (!href || href.startsWith("#") || /^(mailto|tel|sms|javascript|data):/i.test(href)) return
    let abs: URL
    try {
      abs = new URL(href, url)
    } catch {
      return
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return
    if (isSameSite(abs, siteUrl)) {
      internalCount += 1
      if (internal.length < MAX_INTERNAL_LINKS) internal.push({ href: normalizeUrl(abs.toString()), anchorText: clean($(el).text()).slice(0, 120) })
    } else {
      externalCount += 1
    }
  })

  const schemaTypes = extractSchemaTypes($)

  return {
    url, isHomepage, fetchOk: true, httpStatus: fetched.status,
    title, titleLength: title?.length ?? 0,
    metaDescription, metaDescriptionLength: metaDescription?.length ?? 0,
    canonicalUrl, noindex,
    h1Text, h1Count: h1Elements.length,
    headingOutline: extractHeadingOutline($),
    wordCount,
    imageCount: images.length, imagesMissingAlt,
    internalLinkCount: internalCount, externalLinkCount: externalCount, internalLinks: internal,
    hasSchemaMarkup: schemaTypes.length > 0, schemaTypes,
  }
}

function homepageFailure(page: FetchedPage): SeoAuditError {
  if (page.errorCode && page.errorMessage) return new SeoAuditError(page.errorCode, page.errorMessage)
  const s = page.status
  if (s === 401 || s === 403) return new SeoAuditError("unreachable", `The website refused our request (HTTP ${s}). It may block automated tools.`)
  if (s === 404) return new SeoAuditError("unreachable", "That page wasn't found (HTTP 404). Check the address.")
  if (s === 429) return new SeoAuditError("unreachable", "The website is rate-limiting us (HTTP 429). Try again in a few minutes.")
  if (s && s >= 500) return new SeoAuditError("unreachable", `The website returned a server error (HTTP ${s}). Try again later.`)
  if (s) return new SeoAuditError("unreachable", `The website returned an unexpected response (HTTP ${s}).`)
  return new SeoAuditError("unreachable", "We couldn't reach that website. Check that it's online and publicly accessible.")
}

/**
 * Crawls a site: homepage + up to 4 discovered internal pages, plus robots.txt and sitemap.xml existence.
 * Throws SeoAuditError if the address is invalid/blocked or the homepage cannot be fetched; failures on the
 * additional pages are recorded as pages with fetchOk=false and do not abort the crawl.
 */
export async function crawlWebsite(inputUrl: string, deps: CrawlDeps = {}): Promise<CrawlResult> {
  const fetchPage = deps.fetchPage ?? defaultFetchPage
  const fetchAux = deps.fetchAux ?? defaultFetchAux

  const start = validateTargetUrl(inputUrl)
  const deadline = Date.now() + CRAWL_BUDGET_MS

  const homeFetch = await fetchPage(normalizeUrl(start.toString()), deadline)
  if (!homeFetch.ok || !homeFetch.html) throw homepageFailure(homeFetch)

  // After redirects (http -> https, apex -> www) the final URL is the real site root for link discovery.
  const siteUrl = homeFetch.url
  const homepage = extractPageFacts(homeFetch, true, siteUrl)
  const pages: PageFacts[] = [homepage]

  const toCrawl = discoverInternalLinks(homeFetch.html, siteUrl, siteUrl).slice(0, MAX_PAGES - 1)
  const extras = await Promise.all(
    toCrawl.map(async (pageUrl) => extractPageFacts(await fetchPage(pageUrl, deadline), false, siteUrl))
  )
  pages.push(...extras)

  const origin = new URL(siteUrl).origin
  const robotsUrl = new URL("/robots.txt", origin).toString()
  const sitemapUrl = new URL("/sitemap.xml", origin).toString()
  // Their own small budget: a slow page crawl must not make these two files look "missing".
  const auxDeadline = Date.now() + AUX_TIMEOUT_MS + 500
  const [robotsExists, sitemapExists] = await Promise.all([fetchAux(robotsUrl, "robots", auxDeadline), fetchAux(sitemapUrl, "sitemap", auxDeadline)])
  const robotsTxt: AuxFileFact = { exists: robotsExists, url: robotsUrl }
  const sitemapXml: AuxFileFact = { exists: sitemapExists, url: sitemapUrl }

  return { requestedUrl: siteUrl, crawledAt: new Date().toISOString(), pages, robotsTxt, sitemapXml }
}
