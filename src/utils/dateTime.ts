import { i18n } from "../i18n"

// Map Lingui locale codes to BCP-47 tags with regions where Intl needs one
// for the expected formatting (e.g. "nb" alone formats fine on most engines
// but "nb-NO" is the canonical tag).
const REGION_BY_LOCALE: Record<string, string> = {
  nb: "nb-NO",
}

function intlLocale(): string {
  const locale = i18n.locale
  return REGION_BY_LOCALE[locale] ?? locale
}

export function currentDateString() {
  return new Date().toLocaleDateString(intlLocale())
}

export function currentTimeString() {
  return new Date().toLocaleTimeString(intlLocale())
}

export function resolveAutoPlaceholders(markdown: string): string {
  const now = new Date()
  const locale = intlLocale()
  return markdown
    .replace(/\{\{auto:date\}\}/g, now.toLocaleDateString(locale))
    .replace(/\{\{auto:time\}\}/g, now.toLocaleTimeString(locale))
}
