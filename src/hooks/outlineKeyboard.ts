import * as Y from "yjs"
import {
  addSibling,
  addRootSibling,
  addChild,
  toggleCollapse,
  deleteNode,
  moveNode,
  indentNode,
  outdentNode,
  updateTitle,
  updateStyle,
} from "../store"
import { getBindings, matchesBinding, KeyBinding } from "../utils/shortcuts"
import { currentDateString, currentTimeString } from "../utils/dateTime"
import { NodeYRecord, OutletNode } from "../types"
import {
  buildClipboardPayload,
  payloadToHtml,
  payloadToPlainText,
} from "../utils/clipboard"

export interface OutlineKeyContext {
  e: React.KeyboardEvent | KeyboardEvent
  doc: Y.Doc
  nodes: OutletNode[]
  nodeMap: Map<string, NodeYRecord>
  activeId: string | null
  idx: number // index of active node in nodes[], or -1
  setActive: (id: string) => void
  setMode: (m: "nav" | "insert", forId?: string) => void
  undo: () => void
  redo: () => void
  focusEditor?: () => void
  getTemplateContent?: (id: string) => string | undefined
  // Carries the title-on-entry into insert mode; insert.cancel restores it.
  originalTitleRef: { current: string | null }
}

type Handler = (ctx: OutlineKeyContext) => void

// Find the next node selection after deleting/cutting nodes[idx]:
// previous sibling first, else the next visible sibling at the same depth
// or shallower (siblings or ancestors-of-following nodes).
function nextSelectionAfterRemoval(
  nodes: OutletNode[],
  idx: number,
): string | null {
  if (idx <= 0) {
    const nodeToDelete = nodes[idx]
    if (!nodeToDelete) return null
    const found = nodes
      .slice(idx + 1)
      .find((n) => n.depth <= nodeToDelete.depth)
    return found ? found.id : null
  }
  const prev = nodes[idx - 1]
  return prev ? prev.id : null
}

function copyCurrentSubtreeToClipboard(ctx: OutlineKeyContext): void {
  if (!ctx.activeId) return
  const payload = buildClipboardPayload(ctx.activeId, ctx.nodeMap)
  navigator.clipboard
    .write([
      new ClipboardItem({
        "text/html": new Blob([payloadToHtml(payload)], { type: "text/html" }),
        "text/plain": new Blob([payloadToPlainText(payload)], {
          type: "text/plain",
        }),
      }),
    ])
    .catch(() => {
      const ta = document.createElement("textarea")
      ta.value = payloadToPlainText(payload)
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    })
}

function toggleFormat(
  ctx: OutlineKeyContext,
  styleKey: "bold" | "italic" | "strikethrough",
): void {
  if (!ctx.activeId) return
  const record = ctx.nodeMap.get(ctx.activeId)
  if (!record) return
  updateStyle(ctx.doc, ctx.activeId, {
    [styleKey]: !record.style?.[styleKey],
  })
}

function insertDateText(ctx: OutlineKeyContext, text: string): void {
  if (!ctx.activeId) return
  const input = document.activeElement as HTMLInputElement | null
  if (!input || typeof input.value !== "string") return
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  const newValue = input.value.slice(0, start) + text + input.value.slice(end)
  updateTitle(ctx.doc, ctx.activeId, newValue)
  requestAnimationFrame(() =>
    input.setSelectionRange(start + text.length, start + text.length),
  )
}

// --- Handler maps ---

const NAV_HANDLERS: Record<string, Handler> = {
  "nav.up": ({ idx, nodes, setActive }) => {
    const prev = nodes[idx - 1]
    if (prev) setActive(prev.id)
  },
  "nav.down": ({ idx, nodes, setActive }) => {
    const next = nodes[idx + 1]
    if (next) setActive(next.id)
  },
  "nav.expand": ({ idx, nodes, doc }) => {
    const node = nodes[idx]
    if (node?.hasChildren && node.collapsed) toggleCollapse(doc, node.id)
  },
  "nav.collapse": ({ idx, nodes, doc, setActive }) => {
    const node = nodes[idx]
    if (!node) return
    if (node.hasChildren && !node.collapsed) {
      toggleCollapse(doc, node.id)
      return
    }
    // Already collapsed (or no children): jump to parent.
    for (let i = idx - 1; i >= 0; i--) {
      const candidate = nodes[i]
      if (candidate && candidate.depth < node.depth) {
        setActive(candidate.id)
        return
      }
    }
  },
  "nav.focus-editor": ({ focusEditor }) => focusEditor?.(),

  "node.move-up": ({ activeId, doc }) => {
    if (activeId) moveNode(doc, activeId, "up")
  },
  "node.move-down": ({ activeId, doc }) => {
    if (activeId) moveNode(doc, activeId, "down")
  },
  "node.indent": ({ activeId, doc }) => {
    if (activeId) indentNode(doc, activeId)
  },
  "node.outdent": ({ activeId, doc }) => {
    if (activeId) outdentNode(doc, activeId)
  },
  "node.add-sibling": ({ activeId, doc, setActive, setMode }) => {
    if (!activeId) return
    const newId = addSibling(doc, activeId)
    setActive(newId)
    setMode("insert", newId)
  },
  "node.add-child": ({
    activeId,
    doc,
    nodeMap,
    getTemplateContent,
    setActive,
    setMode,
  }) => {
    if (!activeId) return
    const parent = nodeMap.get(activeId)
    const templateId = parent?.data?.defaultChildTemplateId as
      | string
      | undefined
    const templateContent = templateId
      ? getTemplateContent?.(templateId)
      : undefined
    const newId = addChild(doc, activeId, templateContent)
    setActive(newId)
    setMode("insert", newId)
  },
  "node.add-root": ({ activeId, doc, setActive, setMode }) => {
    if (!activeId) return
    const newId = addRootSibling(doc, activeId)
    setActive(newId)
    setMode("insert", newId)
  },

  "node.edit": ({ setMode }) => setMode("insert"),
  "node.delete": (ctx) => {
    if (!ctx.activeId) return
    const nextId = nextSelectionAfterRemoval(ctx.nodes, ctx.idx)
    const idToDelete = ctx.activeId
    if (nextId) ctx.setActive(nextId)
    deleteNode(ctx.doc, idToDelete)
  },
  "node.copy": (ctx) => copyCurrentSubtreeToClipboard(ctx),
  "node.cut": (ctx) => {
    copyCurrentSubtreeToClipboard(ctx)
    if (!ctx.activeId) return
    const nextId = nextSelectionAfterRemoval(ctx.nodes, ctx.idx)
    const idToDelete = ctx.activeId
    if (nextId) ctx.setActive(nextId)
    deleteNode(ctx.doc, idToDelete)
  },
  // Paste is handled by the document-level paste event, not keydown — but
  // the shortcut still needs to be a no-op so the cascade doesn't fall
  // through to a different handler.
  "node.paste": () => {},

  "node.undo": ({ undo }) => undo(),
  "node.redo": ({ redo }) => redo(),

  "format.bold": (ctx) => toggleFormat(ctx, "bold"),
  "format.italic": (ctx) => toggleFormat(ctx, "italic"),
  "format.strikethrough": (ctx) => toggleFormat(ctx, "strikethrough"),
}

const INSERT_HANDLERS: Record<string, Handler> = {
  "insert.confirm": ({ setMode }) => setMode("nav"),
  "insert.cancel": ({ activeId, doc, originalTitleRef, setMode }) => {
    if (activeId && originalTitleRef.current !== null) {
      updateTitle(doc, activeId, originalTitleRef.current)
    }
    setMode("nav")
  },
  "insert.date": (ctx) => insertDateText(ctx, currentDateString()),
  "insert.time": (ctx) => insertDateText(ctx, currentTimeString()),
  "insert.datetime": (ctx) =>
    insertDateText(ctx, `${currentDateString()} ${currentTimeString()}`),
}

function tryDispatch(
  ctx: OutlineKeyContext,
  handlers: Record<string, Handler>,
  bindings: Record<string, KeyBinding>,
): boolean {
  for (const id in handlers) {
    const binding = bindings[id]
    const handler = handlers[id]
    if (!binding || !handler) continue
    if (matchesBinding(ctx.e, binding)) {
      ctx.e.preventDefault()
      handler(ctx)
      return true
    }
  }
  return false
}

// Hardcoded alias: Tab indents, Shift+Tab outdents in nav mode. Kept out of
// the binding map because it isn't user-remappable.
function tryTabAlias(ctx: OutlineKeyContext): boolean {
  if (ctx.e.key !== "Tab") return false
  ctx.e.preventDefault()
  if (!ctx.activeId) return true
  if (ctx.e.shiftKey) outdentNode(ctx.doc, ctx.activeId)
  else indentNode(ctx.doc, ctx.activeId)
  return true
}

export function dispatchOutlineKey(
  ctx: OutlineKeyContext,
  mode: "nav" | "insert",
): void {
  const bindings = getBindings()
  if (mode === "insert") {
    tryDispatch(ctx, INSERT_HANDLERS, bindings)
    return
  }
  if (tryTabAlias(ctx)) return
  tryDispatch(ctx, NAV_HANDLERS, bindings)
}
