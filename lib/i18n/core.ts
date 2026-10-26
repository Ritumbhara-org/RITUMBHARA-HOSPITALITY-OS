// Language support for the staff app. English is the default; Hindi is the other choice.
// Text in the code stays in English and doubles as the lookup key, so a missing Hindi entry
// simply shows the English text instead of breaking anything.

import { hi } from "./hi"

export type Lang = "en" | "hi"
export const LANG_COOKIE = "os_lang"
export const DEFAULT_LANG: Lang = "en"

export function parseLang(value: string | undefined | null): Lang {
  return value === "hi" ? "hi" : DEFAULT_LANG
}

// Fills {name} placeholders, e.g. translate("hi", "{n} total", { n: 3 }).
export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  let out = lang === "hi" ? hi[text] ?? text : text
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

export type Translator = (text: string, vars?: Record<string, string | number>) => string
