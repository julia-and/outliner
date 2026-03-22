import type { LinguiConfig } from "@lingui/conf"

const config: LinguiConfig = {
  sourceLocale: "en",
  locales: ["en", "nb"],
  catalogs: [
    {
      path: "src/locales/{locale}",
      include: ["src"],
    },
  ],
  format: "po",
}

export default config
