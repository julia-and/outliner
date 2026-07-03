import { db, UiStateRow } from "./db"
import { seedStarterTemplates } from "./template"

// --- Device ID (per-device, stored in localStorage so uiState doesn't sync across devices) ---

function getDeviceId(): string {
  let id = localStorage.getItem("ol-device-id")
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem("ol-device-id", id)
  }
  return id
}
const DEVICE_ID = getDeviceId()

// --- UI State Cache (synchronous getters) ---

let uiCache: UiStateRow = {
  id: DEVICE_ID,
  layoutDirection: "horizontal",
  darkMode: false,
}

export function getPanelLayout(): { [id: string]: number } | null {
  return uiCache.panelLayout ?? null
}

export function getLayoutDirection(): "horizontal" | "vertical" {
  return uiCache.layoutDirection
}

export function getDarkMode(): boolean {
  return uiCache.darkMode
}

export function getActiveOutlineId(): string | null {
  return uiCache.activeOutlineId ?? null
}

export function getActiveNodeId(): string | null {
  return uiCache.activeNodeId ?? null
}

export function setPanelLayout(layout: { [id: string]: number }) {
  uiCache = { ...uiCache, panelLayout: layout }
  db.uiState.put(uiCache).catch(console.error)
}

export function setLayoutDirection(direction: "horizontal" | "vertical") {
  uiCache = { ...uiCache, layoutDirection: direction }
  db.uiState.put(uiCache).catch(console.error)
}

export function setDarkMode(value: boolean) {
  uiCache = { ...uiCache, darkMode: value }
  db.uiState.put(uiCache).catch(console.error)
}

// Flip dark mode, persist, apply to the DOM, and notify any listeners so
// UI toggling from elsewhere (e.g. the command palette) stays in sync with
// the toolbar button. Returns the new value.
export function toggleDarkMode(): boolean {
  const next = !getDarkMode()
  setDarkMode(next)
  document.documentElement.dataset.theme = next ? "dark" : "light"
  window.dispatchEvent(new CustomEvent("ol-theme-change"))
  return next
}

export function setActiveOutlineId(id: string | null) {
  uiCache = { ...uiCache, activeOutlineId: id ?? undefined }
  db.uiState.put(uiCache).catch(console.error)
}

export function setActiveNodeId(id: string | null) {
  uiCache = { ...uiCache, activeNodeId: id ?? undefined }
  db.uiState.put(uiCache).catch(console.error)
}

// --- Initialization ---

export async function initStore(): Promise<boolean> {
  const ui = await db.uiState.get(DEVICE_ID)
  if (ui) uiCache = ui

  if ((await db.outlines.count()) === 0) {
    await seedStarterTemplates()
    return true // first run — caller shows welcome screen
  }

  if (!uiCache.activeOutlineId) {
    const first = await db.outlines.orderBy("createdAt").first()
    if (first) setActiveOutlineId(first.id)
  }

  await seedStarterTemplates()
  return false
}
