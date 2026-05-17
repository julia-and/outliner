import { ReactElement } from "react"
import { render, RenderOptions, RenderResult } from "@testing-library/react"
import { I18nProvider } from "@lingui/react"
import { i18n } from "@lingui/core"
import { messages as enMessages } from "./locales/en.po"

// Activate English once for the test runtime so <Trans> macros resolve.
i18n.load("en", enMessages)
i18n.activate("en")

export function renderWithI18n(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    ),
    ...options,
  })
}
