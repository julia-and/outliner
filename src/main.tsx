import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import { initStore } from "./store"
import "./styles.css"

if ("serviceWorker" in navigator) {
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
    <App initPromise={initPromise} />
  </React.StrictMode>,
)
