// Bridges native Tauri menu clicks into a DOM CustomEvent ("ol:command") so
// React components can react to menu items without each importing the Tauri
// API. Off the desktop shell every export is an inert no-op, and the
// @tauri-apps/api import is dynamic so it never enters the web bundle.

const COMMAND_EVENT = "ol:command"

export function initMenuBridge(): () => void {
  if (!__IS_TAURI__) return () => {}

  let unlisten: (() => void) | undefined
  let disposed = false

  import("@tauri-apps/api/event").then(({ listen }) => {
    listen<string>("menu", (event) => {
      window.dispatchEvent(
        new CustomEvent(COMMAND_EVENT, { detail: event.payload }),
      )
    }).then((un) => {
      if (disposed) un()
      else unlisten = un
    })
  })

  return () => {
    disposed = true
    unlisten?.()
  }
}

// Subscribe to a single menu command. Returns an unsubscribe fn. Inert when
// not running under Tauri (the event simply never fires).
export function onMenuCommand(id: string, handler: () => void): () => void {
  if (!__IS_TAURI__) return () => {}
  const fn = (e: Event) => {
    if ((e as CustomEvent<string>).detail === id) handler()
  }
  window.addEventListener(COMMAND_EVENT, fn)
  return () => window.removeEventListener(COMMAND_EVENT, fn)
}
