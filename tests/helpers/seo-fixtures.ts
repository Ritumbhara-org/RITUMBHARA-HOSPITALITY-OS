// Fixtures for the Website SEO Audit tests: a small fake website and fake model answers.

export const words = (n: number) => Array.from({ length: n }, (_, i) => "word" + (i % 50)).join(" ")

export interface PageOpts {
  title?: string | null
  meta?: string | null
  h1s?: string[]
  words?: number
  links?: string[]
  schema?: boolean
  canonical?: string | null
  noindex?: boolean
  imgNoAlt?: number
  extraHead?: string
  extraBody?: string
}

export function html(o: PageOpts = {}): string {
  const title = o.title === undefined ? "Luxury Villa Stays in Jaipur | Ritumbhara Hospitality" : o.title
  const meta = o.meta === undefined ? "Book a luxury villa or studio stay in Jaipur with Ritumbhara. Private pools, chef service and flexible check-in." : o.meta
  const h1s = o.h1s ?? ["Luxury villa stays in Jaipur"]
  const schema = o.schema ?? true
  const canonical = o.canonical === undefined ? "https://example.com/" : o.canonical
  return `<!doctype html><html><head>
    ${title === null ? "" : `<title>${title}</title>`}
    ${meta === null ? "" : `<meta name="description" content="${meta}">`}
    ${canonical === null ? "" : `<link rel="canonical" href="${canonical}">`}
    ${o.noindex ? '<meta name="robots" content="noindex, follow">' : ""}
    ${schema ? '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Hotel","name":"R"},{"@type":["LodgingBusiness","Organization"]}]}</script>' : ""}
    ${o.extraHead ?? ""}
    <script>var tracking = "${words(400)}";</script><style>.a{color:red}</style>
  </head><body>
    ${h1s.map((h) => `<h1>${h}</h1>`).join("")}
    <h2>Rooms</h2><h3>Pool villa</h3>
    <p>${words(o.words ?? 450)}</p>
    ${(o.links ?? []).map((l) => `<a href="${l}">link ${l}</a>`).join("\n")}
    ${Array.from({ length: o.imgNoAlt ?? 0 }, () => '<img src="/x.jpg">').join("")}
    <img src="/ok.jpg" alt="A villa pool">
    ${o.extraBody ?? ""}
  </body></html>`
}

export const SITE_LINKS = [
  "/rooms", "/about", "/contact", "/gallery", "/book", // 5 candidate pages
  "/brochure.pdf", "/hero.jpg", "/feed.xml", // assets that must never be crawled
  "#top", "mailto:hi@example.com", "tel:+911234567890", "javascript:void(0)", // never links
  "https://other-site.com/partner", // external
]

export interface FakePage { status?: number; headers?: Record<string, string>; body: string }

/** A fake site keyed by path. robots.txt/sitemap.xml default to present. */
export function fakeSite(pages: Record<string, FakePage | undefined>) {
  return (path: string): FakePage => {
    if (path === "/robots.txt") return pages[path] ?? { headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml" }
    if (path === "/sitemap.xml") return pages[path] ?? { headers: { "content-type": "application/xml" }, body: '<?xml version="1.0"?><urlset></urlset>' }
    return pages[path] ?? { status: 404, body: "not found" }
  }
}

export function healthySite() {
  return fakeSite({
    "/": { body: html({ links: SITE_LINKS }) },
    "/rooms": { body: html({ title: "Villa Rooms and Suites in Jaipur | Ritumbhara", meta: "Explore private pool villas, studios and suites at Ritumbhara in Jaipur, each with a kitchen and garden.", h1s: ["Rooms and suites"], canonical: "https://example.com/rooms", links: ["/"] }) },
    "/about": { body: html({ title: "About Ritumbhara: FOCO Hospitality in Rajasthan", meta: "Learn how Ritumbhara operates owner-held villas and studios in Jaipur and Alwar for direct bookings.", h1s: ["About Ritumbhara"], canonical: "https://example.com/about", links: ["/"] }) },
    "/contact": { body: html({ title: "Contact Ritumbhara Reservations Team in Jaipur", meta: "Call or message the Ritumbhara reservations team to plan your stay in Jaipur, Alwar or Sariska.", h1s: ["Contact us"], canonical: "https://example.com/contact", links: ["/"] }) },
    "/gallery": { body: html({ title: "Photo Gallery of Villas and Studios | Ritumbhara", meta: "See photos of the pools, bedrooms and gardens at Ritumbhara villas and studios across Rajasthan.", h1s: ["Gallery"], canonical: "https://example.com/gallery", links: ["/"] }) },
  })
}

/** Everything the model is asked for, referring to real crawled URLs. */
export function goodLlmObject(home = "https://example.com/", other = "https://example.com/rooms") {
  return {
    llmKeywordOpportunities: {
      directional: true,
      disclaimer: "model wrote its own disclaimer with fake volume 12,000/mo",
      opportunities: [
        { keyword: "luxury villa jaipur", intent: "transactional", relevantPage: home, rationale: "Matches the homepage offer." },
        { keyword: "villa near sariska", intent: "local", relevantPage: "https://example.com/not-crawled", rationale: "Nearby tiger reserve." },
      ],
    },
    llmLocalSeoRecommendations: [{ recommendation: "Create a Google Business Profile per property.", rationale: "Local pack visibility.", priority: "high" }],
    llmMetaRecommendations: [
      { pageUrl: other, currentTitle: "MODEL INVENTED TITLE", recommendedTitle: "Villa Rooms in Jaipur | Ritumbhara", currentMetaDescription: "MODEL INVENTED", recommendedMetaDescription: "Private pool villas in Jaipur with chef service.", rationale: "Add location." },
      { pageUrl: "https://example.com/invented", currentTitle: null, recommendedTitle: "x", currentMetaDescription: null, recommendedMetaDescription: "y", rationale: "z" },
    ],
    llmHeadingRecommendations: [{ pageUrl: home, issue: "H1 is generic.", recommendation: "Include the city in the H1." }],
    llmContentGaps: [{ topic: "Sariska safari stays", gapType: "missing_page", rationale: "Target market.", suggestedAction: "Publish a Sariska landing page." }],
    llmInternalLinkingSuggestions: [
      { fromPage: home, toPage: other, suggestedAnchorText: "villa rooms", rationale: "Pass authority." },
      { fromPage: home, toPage: home, suggestedAnchorText: "self", rationale: "self link" },
      { fromPage: home, toPage: "https://example.com/phantom", suggestedAnchorText: "ghost", rationale: "ghost" },
    ],
    llmPrioritizedRecommendations: [
      { id: "r1", title: "Add city to titles", category: "on_page", priorityScore: 91, impact: "high", effort: "low", description: "Titles lack location." },
      { id: "r1", title: "Duplicate id item", category: "content", priorityScore: "72", impact: "MEDIUM", effort: "weird", description: "Dup id gets renamed." },
    ],
    llmActionPlan: [
      { step: 2, title: "Second", description: "Do second.", relatedRecommendationIds: ["r1", "nope"] },
      { step: 1, title: "First", description: "Do first.", relatedRecommendationIds: ["r1"] },
    ],
  }
}

export const goodLlmJson = (home?: string, other?: string) => JSON.stringify(goodLlmObject(home, other))
