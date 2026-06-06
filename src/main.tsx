import React from "react"
import ReactDOM from "react-dom/client"
import { I18nProvider } from "@lingui/react"
import { i18n } from "./i18n"
import { App } from "./App"
import { initStore } from "./store"
import "./styles.css"

// Flag the desktop shell + platform so CSS can clear the macOS traffic lights
// that overlay the toolbar (titleBarStyle: Overlay).
if (__IS_TAURI__ && navigator.userAgent.includes("Macintosh")) {
  document.documentElement.dataset.tauri = "mac"
}

if (!__IS_TAURI__ && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((registration) => {
    const notifyUpdate = () => window.dispatchEvent(new Event("sw-update-available"))

    if (registration.waiting) {
      notifyUpdate()
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing
      if (!newWorker) return
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          notifyUpdate()
        }
      })
    })
  })
}

const initPromise = initStore()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider i18n={i18n}>
      <App initPromise={initPromise} />
    </I18nProvider>
  </React.StrictMode>,
)
