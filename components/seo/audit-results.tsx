"use client"

import { useState, type ReactNode } from "react"
import { AlertCircle, Check, ClipboardCopy, Download, Info } from "lucide-react"
import { useTr } from "@/components/i18n/language-provider"
import type { IssueSeverity, SeoAuditResult, LlmAuditSynthesis } from "@/lib/seo/types"

const SEVERITY_ORDER: IssueSeverity[] = ["critical", "high", "medium", "low"]
const SEVERITY_STYLE: Record<IssueSeverity, string> = {
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  low: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
}
const LEVEL_STYLE: Record<string, string> = {
  high: SEVERITY_STYLE.high,
  medium: SEVERITY_STYLE.medium,
  low: SEVERITY_STYLE.low,
}

const path = (u: string) => {
  try {
    const x = new URL(u)
    return x.pathname === "/" ? x.hostname : x.pathname + x.search
  } catch {
    return u
  }
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${className}`}>{children}</span>
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden">
      <h2 className="p-4 border-b border-border/40 font-semibold bg-muted/20 text-sm flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
        {title}
        {count !== undefined && <span className="text-xs font-normal text-muted-foreground">({count})</span>}
      </h2>
      <div className="p-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function scoreTone(score: number) {
  if (score >= 80) return { ring: "text-emerald-500", label: "Good" }
  if (score >= 55) return { ring: "text-amber-500", label: "Needs work" }
  return { ring: "text-red-500", label: "Poor" }
}

function planText(result: SeoAuditResult, ai?: LlmAuditSynthesis): string {
  const lines = [`SEO action plan for ${result.url}`, `Technical score: ${result.score}/100`, ""]
  if (result.issues.length) {
    lines.push("Issues to fix")
    for (const i of result.issues) lines.push(`- [${i.severity.toUpperCase()}] ${i.title}: ${i.fix}`)
    lines.push("")
  }
  if (ai?.actionPlan.length) {
    lines.push("Action plan")
    for (const s of ai.actionPlan) lines.push(`${s.step}. ${s.title} - ${s.description}`)
  }
  return lines.join("\n")
}

export function AuditResults({ result }: { result: SeoAuditResult }) {
  const tr = useTr()
  const [copied, setCopied] = useState(false)
  const ai = result.ai.data
  const tone = scoreTone(result.score)
  const grouped = SEVERITY_ORDER.map((s) => ({ s, items: result.issues.filter((i) => i.severity === s) }))
  const failedChecks = result.scoreBreakdown.filter((c) => !c.passed).length

  const text = planText(result, ai)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable: the download button still works */
    }
  }
  function download() {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
    a.download = "seo-action-plan.txt"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Overall score */}
      <section className="bg-card border border-border/60 rounded-2xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4">
          <div className={`text-5xl font-bold tabular-nums ${tone.ring}`} aria-label={`${tr("SEO score")} ${result.score} / 100`}>
            {result.score}
            <span className="text-lg text-muted-foreground font-medium">/100</span>
          </div>
          <div>
            <div className="font-semibold">{tr(tone.label)}</div>
            <div className="text-xs text-muted-foreground">{tr("Technical SEO score")}</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:ml-auto text-sm">
          {SEVERITY_ORDER.map((s) => (
            <div key={s}>
              <dt className="text-xs text-muted-foreground capitalize">{tr(s)}</dt>
              <dd className="font-semibold tabular-nums">{result.issues.filter((i) => i.severity === s).length}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground sm:basis-full">
          {path(result.url)} · {result.pagesCrawled.length} {tr("pages checked")} · {failedChecks} {tr("checks failed")}
        </p>
      </section>

      {/* AI status */}
      {result.ai.status !== "ok" && (
        <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <span>{result.ai.message ?? tr("Some recommendations are unavailable.")}</span>
        </div>
      )}

      {/* Issues by severity */}
      <Section title={tr("Issues by priority")} count={result.issues.length}>
        {result.issues.length === 0 && <Empty>{tr("No technical issues found.")}</Empty>}
        {grouped.map(({ s, items }) =>
          items.length === 0 ? null : (
            <div key={s} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(s)} ({items.length})</h3>
              {items.map((i) => (
                <article key={i.id} className="rounded-xl border border-border/50 p-3 flex flex-col gap-1.5">
                  <div className="flex items-start gap-2 flex-wrap">
                    <Badge className={SEVERITY_STYLE[i.severity]}>{tr(i.severity)}</Badge>
                    <span className="text-sm font-medium">{i.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{i.detail}</p>
                  <p className="text-sm"><span className="font-medium">{tr("Fix")}: </span>{i.fix}</p>
                  {i.affectedUrls.length > 0 && (
                    <p className="text-xs text-muted-foreground break-words">
                      {tr("Affects")}: {i.affectedUrls.slice(0, 5).map(path).join(", ")}
                      {i.affectedUrls.length > 5 && ` +${i.affectedUrls.length - 5}`}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )
        )}
      </Section>

      {ai && (
        <>
          <Section title={tr("Prioritized recommendations")} count={ai.prioritizedRecommendations.length}>
            {ai.prioritizedRecommendations.length === 0 && <Empty>{tr("No recommendations were returned.")}</Empty>}
            {[...ai.prioritizedRecommendations].sort((a, b) => b.priorityScore - a.priorityScore).map((r) => (
              <article key={r.id} className="rounded-xl border border-border/50 p-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{r.title}</span>
                  <Badge className={LEVEL_STYLE[r.impact]}>{tr("Impact")}: {tr(r.impact)}</Badge>
                  <Badge className="border-border text-muted-foreground">{tr("Effort")}: {tr(r.effort)}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{r.priorityScore}/100</span>
                </div>
                <p className="text-sm text-muted-foreground">{r.description}</p>
              </article>
            ))}
          </Section>

          <Section title={tr("Keyword opportunities")} count={ai.keywordOpportunities.length}>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />{ai.keywordDisclaimer}
            </p>
            {ai.keywordOpportunities.length === 0 && <Empty>{tr("No keyword opportunities were returned.")}</Empty>}
            {ai.keywordOpportunities.map((k, i) => (
              <article key={i} className="rounded-xl border border-border/50 p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{k.keyword}</span>
                  <Badge className="border-border text-muted-foreground">{k.intent}</Badge>
                  {k.relevantPage && <span className="text-xs text-muted-foreground">{path(k.relevantPage)}</span>}
                </div>
                <p className="text-sm text-muted-foreground">{k.rationale}</p>
              </article>
            ))}
          </Section>

          <Section title={tr("Local SEO")} count={ai.localSeoRecommendations.length}>
            {ai.localSeoRecommendations.length === 0 && <Empty>{tr("No local SEO recommendations were returned.")}</Empty>}
            {ai.localSeoRecommendations.map((r, i) => (
              <article key={i} className="rounded-xl border border-border/50 p-3 flex flex-col gap-1">
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge className={LEVEL_STYLE[r.priority]}>{tr(r.priority)}</Badge>
                  <span className="text-sm font-medium">{r.recommendation}</span>
                </div>
                <p className="text-sm text-muted-foreground">{r.rationale}</p>
              </article>
            ))}
          </Section>

          <Section title={tr("Meta titles and descriptions")} count={ai.metaRecommendations.length}>
            {ai.metaRecommendations.length === 0 && <Empty>{tr("No meta recommendations were returned.")}</Empty>}
            {ai.metaRecommendations.map((m, i) => (
              <article key={i} className="rounded-xl border border-border/50 p-3 flex flex-col gap-2 text-sm">
                <div className="font-medium break-words">{path(m.pageUrl)}</div>
                <div><span className="text-xs text-muted-foreground">{tr("Current title")}</span><div className="break-words">{m.currentTitle ?? tr("(missing)")}</div></div>
                <div><span className="text-xs text-muted-foreground">{tr("Recommended title")}</span><div className="break-words font-medium">{m.recommendedTitle}</div></div>
                <div><span className="text-xs text-muted-foreground">{tr("Current description")}</span><div className="break-words">{m.currentMetaDescription ?? tr("(missing)")}</div></div>
                <div><span className="text-xs text-muted-foreground">{tr("Recommended description")}</span><div className="break-words font-medium">{m.recommendedMetaDescription}</div></div>
                <p className="text-muted-foreground">{m.rationale}</p>
              </article>
            ))}
          </Section>

          <Section title={tr("Heading issues")} count={ai.headingRecommendations.length}>
            {ai.headingRecommendations.length === 0 && <Empty>{tr("No heading issues were returned.")}</Empty>}
            {ai.headingRecommendations.map((h, i) => (
              <article key={i} className="rounded-xl border border-border/50 p-3 flex flex-col gap-1 text-sm">
                <div className="font-medium break-words">{path(h.pageUrl)}</div>
                <p className="text-muted-foreground">{h.issue}</p>
                <p>{h.recommendation}</p>
              </article>
            ))}
          </Section>

          <Section title={tr("Content gaps")} count={ai.contentGaps.length}>
            {ai.contentGaps.length === 0 && <Empty>{tr("No content gaps were returned.")}</Empty>}
            {ai.contentGaps.map((g, i) => (
              <article key={i} className="rounded-xl border border-border/50 p-3 flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{g.topic}</span>
                  <Badge className="border-border text-muted-foreground">{g.gapType.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-muted-foreground">{g.rationale}</p>
                <p>{g.suggestedAction}</p>
              </article>
            ))}
          </Section>

          <Section title={tr("Internal linking")} count={ai.internalLinkingSuggestions.length}>
            {ai.internalLinkingSuggestions.length === 0 && <Empty>{tr("No internal linking suggestions were returned.")}</Empty>}
            {ai.internalLinkingSuggestions.map((l, i) => (
              <article key={i} className="rounded-xl border border-border/50 p-3 flex flex-col gap-1 text-sm">
                <div className="break-words"><span className="font-medium">{path(l.fromPage)}</span> → <span className="font-medium">{path(l.toPage)}</span></div>
                <div>{tr("Anchor text")}: “{l.suggestedAnchorText}”</div>
                <p className="text-muted-foreground">{l.rationale}</p>
              </article>
            ))}
          </Section>

          <Section title={tr("Action plan")} count={ai.actionPlan.length}>
            {ai.actionPlan.length === 0 && <Empty>{tr("No action plan was returned.")}</Empty>}
            <ol className="flex flex-col gap-2">
              {ai.actionPlan.map((s) => (
                <li key={s.step} className="rounded-xl border border-border/50 p-3 flex gap-3 text-sm">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs font-semibold">{s.step}</span>
                  <div><div className="font-medium">{s.title}</div><p className="text-muted-foreground">{s.description}</p></div>
                </li>
              ))}
            </ol>
          </Section>
        </>
      )}

      {!ai && result.issues.length > 0 && (
        <p className="text-sm text-muted-foreground flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{tr("Run the audit again later to add AI-written recommendations and the action plan.")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 h-9 text-sm hover:bg-muted/40">
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied ? tr("Copied") : tr("Copy action plan")}
        </button>
        <button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 h-9 text-sm hover:bg-muted/40">
          <Download className="h-4 w-4" />{tr("Download")}
        </button>
      </div>
    </div>
  )
}
