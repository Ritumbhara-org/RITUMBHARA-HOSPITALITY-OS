"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LANG_COOKIE, translate, type Lang, type Translator } from "@/lib/i18n/core"

interface LanguageState {
  lang: Lang
  setLang: (lang: Lang) => void
  tr: Translator
}

const LanguageContext = createContext<LanguageState>({
  lang: "en",
  setLang: () => {},
  tr: (text, vars) => translate("en", text, vars),
})

// The language comes from a cookie so the server renders the right language on the first paint.
export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const router = useRouter()
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [, startTransition] = useTransition()

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next)
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
      // Server-rendered text (page headings, messages) picks up the new language too.
      startTransition(() => router.refresh())
    },
    [router],
  )

  // Screen readers and the browser's own spell-check follow the page language.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<LanguageState>(
    () => ({ lang, setLang, tr: (text, vars) => translate(lang, text, vars) }),
    [lang, setLang],
  )
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}

// Shorthand used across the app: const tr = useTr(); tr("Reservations")
export function useTr(): Translator {
  return useContext(LanguageContext).tr
}
