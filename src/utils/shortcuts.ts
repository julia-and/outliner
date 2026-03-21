import React from "react"

const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().includes("MAC")

export interface KeyBinding {
  key: string
  cmd?: boolean
  shift?: boolean
  alt?: boolean
}

export interface ShortcutDef {
  id: string
  label: string
  group: "Navigation" | "Structure" | "Editing"
  defaultBinding: KeyBinding
  /** Hardcoded alias shown in the popup but not remappable */
  alias?: KeyBinding
  /** Defaults to true */
  remappable?: boolean
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  // Navigation
  { id: "nav.up",           label: "Move up",           group: "Navigation", defaultBinding: { key: "ArrowUp" } },
  { id: "nav.down",         label: "Move down",          group: "Navigation", defaultBinding: { key: "ArrowDown" } },
  { id: "nav.expand",       label: "Expand / enter",     group: "Navigation", defaultBinding: { key: "ArrowRight" } },
  { id: "nav.collapse",     label: "Collapse / parent",  group: "Navigation", defaultBinding: { key: "ArrowLeft" } },
  { id: "nav.focus-editor", label: "Focus editor",        group: "Navigation", defaultBinding: { key: "e" } },
  // Structure
  {
    id: "node.indent",
    label: "Indent",
    group: "Structure",
    defaultBinding: { key: "ArrowRight", cmd: true },
    alias: { key: "Tab" },
  },
  {
    id: "node.outdent",
    label: "Outdent",
    group: "Structure",
    defaultBinding: { key: "ArrowLeft", cmd: true },
    alias: { key: "Tab", shift: true },
  },
  { id: "node.move-up",   label: "Move node up",   group: "Structure", defaultBinding: { key: "ArrowUp",   cmd: true } },
  { id: "node.move-down", label: "Move node down",  group: "Structure", defaultBinding: { key: "ArrowDown", cmd: true } },
  { id: "node.add-sibling", label: "Add sibling",   group: "Structure", defaultBinding: { key: "Enter" } },
  { id: "node.add-child",   label: "Add child",     group: "Structure", defaultBinding: { key: "Enter", cmd: true } },
  { id: "node.add-root",    label: "Add root node", group: "Structure", defaultBinding: { key: "Enter", cmd: true, shift: true } },
  // Editing
  { id: "node.edit",      label: "Edit title",   group: "Editing", defaultBinding: { key: "i" } },
  { id: "node.delete",    label: "Delete node",  group: "Editing", defaultBinding: { key: "Backspace" } },
  { id: "node.copy",      label: "Copy node",    group: "Editing", defaultBinding: { key: "c", cmd: true } },
  { id: "node.cut",       label: "Cut node",     group: "Editing", defaultBinding: { key: "x", cmd: true } },
  { id: "node.paste",     label: "Paste",        group: "Editing", defaultBinding: { key: "v", cmd: true } },
  { id: "insert.confirm",  label: "Confirm edit",   group: "Editing", defaultBinding: { key: "Enter" }, remappable: false },
  { id: "insert.cancel",   label: "Cancel edit",    group: "Editing", defaultBinding: { key: "Escape" }, remappable: false },
  { id: "insert.date",     label: "Insert date",    group: "Editing", defaultBinding: { key: "d", cmd: true, shift: true } },
  { id: "insert.time",     label: "Insert time",    group: "Editing", defaultBinding: { key: "t", cmd: true, shift: true } },
  { id: "insert.datetime", label: "Insert date+time", group: "Editing", defaultBinding: { key: ";", cmd: true, shift: true } },
  { id: "node.undo", label: "Undo", group: "Editing", defaultBinding: { key: "z", cmd: true } },
  { id: "node.redo", label: "Redo", group: "Editing", defaultBinding: { key: "z", cmd: true, shift: true } },
]

// Shortcuts that only apply in nav mode (for conflict detection)
const NAV_IDS = new Set([
  "nav.up", "nav.down", "nav.expand", "nav.collapse", "nav.focus-editor",
  "node.indent", "node.outdent", "node.move-up", "node.move-down",
  "node.add-sibling", "node.add-child", "node.add-root",
  "node.edit", "node.delete",
  "node.copy", "node.cut", "node.paste",
  "node.undo", "node.redo",
])
const INSERT_IDS = new Set(["insert.confirm", "insert.cancel", "insert.date", "insert.time", "insert.datetime"])

function modeOf(id: string): "nav" | "insert" | null {
  if (NAV_IDS.has(id)) return "nav"
  if (INSERT_IDS.has(id)) return "insert"
  return null
}

const STORAGE_KEY = "ol-shortcuts"

export function getStoredOverrides(): Record<string, KeyBinding> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, KeyBinding>) : {}
  } catch {
    return {}
  }
}

export function getBindings(): Record<string, KeyBinding> {
  const result: Record<string, KeyBinding> = {}
  for (const def of SHORTCUT_DEFS) {
    result[def.id] = def.defaultBinding
  }
  const overrides = getStoredOverrides()
  for (const def of SHORTCUT_DEFS) {
    if (def.remappable !== false && overrides[def.id]) {
      result[def.id] = overrides[def.id]
    }
  }
  return result
}

export function setBinding(id: string, binding: KeyBinding): void {
  try {
    const overrides = getStoredOverrides()
    overrides[id] = binding
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {}
}

export function resetBinding(id: string): void {
  try {
    const overrides = getStoredOverrides()
    delete overrides[id]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {}
}

export function findConflict(
  proposingId: string,
  newBinding: KeyBinding,
  bindings: Record<string, KeyBinding>,
): string | null {
  const proposingMode = modeOf(proposingId)
  for (const [id, binding] of Object.entries(bindings)) {
    if (id === proposingId) continue
    if (modeOf(id) !== proposingMode) continue
    if (
      binding.key === newBinding.key &&
      !!binding.cmd === !!newBinding.cmd &&
      !!binding.shift === !!newBinding.shift &&
      !!binding.alt === !!newBinding.alt
    ) {
      return id
    }
  }
  return null
}

export function matchesBinding(
  e: React.KeyboardEvent | KeyboardEvent,
  binding: KeyBinding,
): boolean {
  if (e.key !== binding.key) return false
  const cmd = isMac ? e.metaKey : e.ctrlKey
  if (!!binding.cmd !== cmd) return false
  if (!!binding.shift !== e.shiftKey) return false
  if (!!binding.alt !== e.altKey) return false
  return true
}

export function formatBinding(binding: KeyBinding): string {
  const parts: string[] = []
  if (binding.cmd) parts.push(isMac ? "⌘" : "Ctrl")
  if (binding.shift) parts.push(isMac ? "⇧" : "Shift")
  if (binding.alt) parts.push(isMac ? "⌥" : "Alt")
  parts.push(formatKey(binding.key))
  return parts.join(" ")
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "↩",
    Escape: "Esc",
    Backspace: "⌫",
    Tab: "Tab",
    " ": "Space",
  }
  return map[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}
