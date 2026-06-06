// Keeps the native (Tauri) menu accelerators in sync with the app's live,
// remappable keyboard bindings. Only the focus-routable Edit items get
// accelerators (see menuBridge handlers) — a window-global accelerator would
// otherwise shadow the editor pane's own keys. Inert off the desktop shell.

import { getBindings, type KeyBinding } from "../utils/shortcuts"

// Menu item id → where its accelerator comes from. `shortcutId` follows a live
// (remappable) binding; `fixed` is a constant for items with no shortcut def.
const SYNC_MAP: { menuId: string; shortcutId?: string; fixed?: string }[] = [
  { menuId: "edit.copy", shortcutId: "node.copy" },
  { menuId: "edit.cut", shortcutId: "node.cut" },
  { menuId: "edit.select-all", fixed: "CmdOrCtrl+A" },
]

// Convert a binding to a Tauri accelerator string, or null if it can't be a
// safe menu accelerator. Only modifier-bearing (Cmd/Ctrl) bindings qualify: a
// bare-key accelerator would intercept normal typing/navigation.
export function bindingToAccelerator(b: KeyBinding | undefined): string | null {
  if (!b || !b.cmd) return null
  const key = keyToAccelerator(b.key)
  if (!key) return null
  const parts = ["CmdOrCtrl"]
  if (b.shift) parts.push("Shift")
  if (b.alt) parts.push("Alt")
  parts.push(key)
  return parts.join("+")
}

function keyToAccelerator(key: string): string | null {
  if (key.length === 1) return key.toUpperCase()
  const map: Record<string, string> = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
  }
  return map[key] ?? null
}

export async function syncMenuAccelerators(): Promise<void> {
  if (!__IS_TAURI__) return
  const bindings = getBindings()
  const updates = SYNC_MAP.map(({ menuId, shortcutId, fixed }) => ({
    id: menuId,
    accelerator: shortcutId
      ? bindingToAccelerator(bindings[shortcutId])
      : (fixed ?? null),
  }))
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("set_menu_accelerators", { updates })
  } catch {
    // Desktop-only; ignore failures (e.g. command unavailable).
  }
}
