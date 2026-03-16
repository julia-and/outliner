import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import { initStore } from "./store"
import "./styles.css"

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
}

const initPromise = initStore()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App initPromise={initPromise} />
  </React.StrictMode>,
)
