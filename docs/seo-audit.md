# Website SEO Audit

Admin-only tool that audits a public website and returns a score, prioritized issues and an AI-written action plan.
Page: `/seo-audit` (sidebar: "Website Audit"). API: `POST /api/seo/audit`. The older property SEO generator at `/seo` is unchanged.

## How it works
1. `lib/seo/url-safety.ts` + `safe-fetch.ts` validate the URL and fetch pages safely (see Security).
2. `crawler.ts` reads up to 5 pages (homepage + internal links), `robots.txt` and `sitemap.xml`.
3. `analyzer.ts` runs 15 weighted rule checks -> score (0-100) and issues (critical/high/medium/low). No AI involved.
4. `llm.ts` / `llm-provider.ts` ask the model for keyword opportunities, local SEO, meta title/description, heading,
   content-gap and internal-linking recommendations, prioritized recommendations and an action plan. Output is parsed
   leniently and validated item by item; invented URLs are dropped.
5. If the AI step fails, the technical audit is still returned with a clear message.

No database, no migration: audits are computed per request and not stored.

## Environment variables (set in Vercel, Production + Preview)
| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Yes (default provider) | Already used elsewhere in the OS; no change if it is set. |
| `SEO_LLM_PROVIDER` | No | `gemini` (default) or `anthropic`. |
| `SEO_GEMINI_MODEL` | No | Default `gemini-2.5-flash`. |
| `ANTHROPIC_API_KEY` | Only if provider = `anthropic` | |
| `SEO_ANTHROPIC_MODEL` | No | Default `claude-sonnet-5-5`. |

(`.env.example` is not added because the repo's `.gitignore` ignores `.env*`.) No existing variable is changed.

## Security
- Only the signed-in admin can reach the page or API (`proxy.ts` + `adminApiGuard()` + `requireAdminPage`).
- Only http/https on ports 80/443; no credentials in URLs; localhost, `.local`/`.internal`, single-label names and
  private/loopback/link-local/metadata IPs are refused, including decimal/hex/octal IP forms and IPv6 equivalents.
- DNS answers are checked at connect time (all must be public); redirects (max 3) are re-validated and must stay on the same site.
- Limits: 1.5 MB per page (decoded), 5 pages, ~22 s crawl, 60 s route limit; 10 audits per 10 min and 2 at once
  (per server instance, in memory).
- Model input is treated as untrusted data; errors shown to users never include stack traces, keys or internal addresses.

## Tests
`tests/seo-url-safety.test.ts`, `seo-safe-fetch.test.ts`, `seo-engine.test.ts`, `seo-audit-route.test.ts`.
