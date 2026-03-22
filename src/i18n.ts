import { i18n } from "@lingui/core"
import { messages as enMessages } from "./locales/en.po"

export const LOCALES = {
  en: "English",
  nb: "Norsk bokmål",
} as const

export type Locale = keyof typeof LOCALES

const LOCALE_KEY = "ol-locale"

function detectLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY)
  if (stored && stored in LOCALES) return stored as Locale

  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.split("-")[0]
    if (base in LOCALES) return base as Locale
    // nb/nn both map to nb
    if (base === "nn") return "nb"
  }
  return "en"
}

export function getLocale(): Locale {
  return i18n.locale as Locale
}

export async function loadLocale(locale: Locale) {
  if (locale === "en") {
    i18n.load("en", enMessages)
  } else {
    const { messages } = await import(`./locales/${locale}.po`)
    i18n.load(locale, messages)
  }
  i18n.activate(locale)
  localStorage.setItem(LOCALE_KEY, locale)
}

// Activate detected locale synchronously for English (bundled),
// async for others (lazy-loaded).
const initial = detectLocale()
i18n.load("en", enMessages)
if (initial === "en") {
  i18n.activate("en")
} else {
  // Activate English immediately so the UI isn't blank, then swap.
  i18n.activate("en")
  loadLocale(initial)
}

export { i18n }
