"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, Loader2, SearchCheck, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTr } from "@/components/i18n/language-provider"
import { AuditResults } from "@/components/seo/audit-results"
import type { SeoAuditResult } from "@/lib/seo/types"

// Honest progress: the server does one request, so these are the phases it goes through, advanced by elapsed time.
const PHASES = [
  { after: 0, label: "Reading your website" },
  { after: 8, label: "Checking titles, headings, links and technical basics" },
  { after: 20, label: "Writing recommendations" },
]

export function AuditClient() {
  const tr = useTr()
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<SeoAuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!loading) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [loading])

  useEffect(() => () => abortRef.current?.abort(), [])

  const phase = [...PHASES].reverse().find((p) => elapsed >= p.after) ?? PHASES[0]

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    const trimmed = url.trim()
    if (!trimmed) {
      setError(tr("Enter your website address to start."))
      return
    }
    setElapsed(0)
    setLoading(true)
    setError(null)
    setResult(null)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const res = await fetch("/api/seo/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: ac.signal,
      })
      const data = await res.json().catch(() => null)
      if (res.status === 401) throw new Error(tr("Your session has expired. Please sign in again."))
      if (!res.ok || !data?.success) throw new Error(data?.error || tr("The audit could not be completed. Please try again."))
      setResult(data.data as SeoAuditResult)
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError(err instanceof Error ? err.message : tr("The audit could not be completed. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col w-full gap-4 sm:gap-5 pb-6">
      <div className="flex flex-col gap-1.5 shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 p-2 shadow-lg shadow-violet-500/20">
            <SearchCheck className="h-5 w-5 text-white" />
          </div>
          {tr("Website SEO Audit")}
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl sm:ml-[44px]">
          {tr("Check a website's SEO health and get a prioritized plan to improve it.")}{" "}
          <Link href="/seo" className="text-violet-600 dark:text-violet-400 underline underline-offset-2">
            {tr("Looking for the property SEO generator?")}
          </Link>
        </p>
      </div>

      <form onSubmit={run} className="bg-card border border-border/60 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="grid gap-2 flex-1">
          <Label htmlFor="audit-url">{tr("Website address")}</Label>
          <Input
            id="audit-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="www.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            maxLength={2048}
            aria-describedby={error ? "audit-error" : undefined}
            className="rounded-xl"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white px-5 h-10 text-sm font-medium shadow-sm disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? tr("Auditing…") : tr("Run SEO Audit")}
        </button>
      </form>

      <div aria-live="polite">
        {loading && (
          <div className="bg-card border border-border/60 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            <p className="text-sm font-medium">{tr(phase.label)}…</p>
            <p className="text-xs text-muted-foreground">{tr("This usually takes 20–50 seconds. Please keep this page open.")}</p>
          </div>
        )}
        {error && !loading && (
          <div id="audit-error" role="alert" className="flex items-start gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && !loading && <AuditResults result={result} />}
    </div>
  )
}
