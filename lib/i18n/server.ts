// Server-side helpers: read the chosen language from the cookie. SERVER-ONLY.
import { cookies } from "next/headers"
import { LANG_COOKIE, parseLang, translate, type Lang, type Translator } from "./core"

export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value)
}

export async function getTranslator(): Promise<Translator> {
  const lang = await getLang()
  return (text, vars) => translate(lang, text, vars)
}
