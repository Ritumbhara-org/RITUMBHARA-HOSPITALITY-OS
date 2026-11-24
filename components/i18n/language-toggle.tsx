"use client"

import { useLanguage } from "./language-provider"

// English / Hindi switch. English is the default.
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage()
  const option = (value: "en" | "hi", label: string, aria: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={lang === value}
      aria-label={aria}
      onClick={() => lang !== value && setLang(value)}
      className={`h-7 min-w-9 rounded-lg px-2 text-xs font-semibold transition-colors ${
        lang === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
  return (
    <div role="radiogroup" aria-label="Language / भाषा" className={`inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-muted/60 p-0.5 ${className}`}>
      {option("en", "EN", "English")}
      {option("hi", "हिं", "हिंदी")}
    </div>
  )
}
