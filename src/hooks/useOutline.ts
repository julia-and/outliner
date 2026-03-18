import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from "react"
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
  updateTitle as storeUpdateTitle,
  getActiveNodeId,
  setActiveNodeId,
  pasteSubtree,
  createNode,
  getNodesMap,
} from "../store"
import { getBindings, matchesBinding } from "../utils/shortcuts"
import { NodeYRecord, OutletNode } from "../types"
import {
  buildClipboardPayload,
  payloadToHtml,
  payloadToPlainText,
  parseClipboard,
} from "../utils/clipboard"

function flattenVisibleNodes(nodesSnapshot: Map<string, NodeYRecord>): OutletNode[] {
  const result: OutletNode[] = []

  const childMap = new Map<string | null, [string, NodeYRecord][]>()
  for (const [id, node] of nodesSnapshot) {
    const key = node.parentId
    if (!childMap.has(key)) childMap.set(key, [])
    childMap.get(key)!.push([id, node])
  }
  for (const children of childMap.values()) {
    children.sort(([, a], [, b]) => a.order - b.order)
  }

  const visit = (id: string, node: NodeYRecord, depth: number) => {
    const children = childMap.get(id) ?? []
    result.push({
      id,
      parentId: node.parentId,
      title: node.title,
      depth,
      style: node.style || {},
      collapsed: node.collapsed,
      hasChildren: children.length > 0,
      data: node.data || {},
    })
    if (!node.collapsed) {
      for (const [childId, childNode] of children) visit(childId, childNode, depth + 1)
    }
  }

  const roots = childMap.get(null) ?? []
  for (const [id, node] of roots) visit(id, node, 0)

  return result
}

function useNodesSnapshot(nodesMap: Y.Map<NodeYRecord>): Map<string, NodeYRecord> {
  const cacheRef = useRef<{ map: Y.Map<NodeYRecord>; snapshot: Map<string, NodeYRecord> }>({
    map: nodesMap,
    snapshot: new Map(nodesMap.entries()),
  })

  // Synchronously update cache if nodesMap changed (outline switch)
  if (cacheRef.current.map !== nodesMap) {
    cacheRef.current = { map: nodesMap, snapshot: new Map(nodesMap.entries()) }
  }

  const subscribe = useCallback(
    (cb: () => void) => {
      const handler = () => {
        cacheRef.current = { ...cacheRef.current, snapshot: new Map(nodesMap.entries()) }
        cb()
      }
      nodesMap.observeDeep(handler)
      return () => nodesMap.unobserveDeep(handler)
    },
    [nodesMap],
  )

  // Stable getter — always returns the cached snapshot reference
  const getSnapshot = useCallback(() => cacheRef.current.snapshot, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useOutline(
  outlineDoc: Y.Doc,
  isNew = false,
  getTemplateContent?: (templateId: string) => string | undefined,
  onFocusEditor?: () => void,
) {
  const [activeId, setActiveId] = useState<string | null>(getActiveNodeId)
  const [mode, setMode] = useState<"nav" | "insert">("nav")

  const activeIdRef = useRef(activeId)
  const modeRef = useRef(mode)
  const originalTitleRef = useRef<string | null>(null)

  useEffect(() => {
    activeIdRef.current = activeId
    setActiveNodeId(activeId)
  }, [activeId])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const nodesMap = useMemo(() => getNodesMap(outlineDoc), [outlineDoc])
  const undoManager = useMemo(
    () => new Y.UndoManager(nodesMap, { captureTimeout: 500 }),
    [nodesMap],
  )

  const nodesSnapshot = useNodesSnapshot(nodesMap)
  const nodes = useMemo(() => flattenVisibleNodes(nodesSnapshot), [nodesSnapshot])
  const nodeMap = nodesSnapshot

  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const nodesSnapshotRef = useRef(nodesSnapshot)
  useEffect(() => {
    nodesSnapshotRef.current = nodesSnapshot
  }, [nodesSnapshot])

  const getTemplateContentRef = useRef(getTemplateContent)
  getTemplateContentRef.current = getTemplateContent

  const onFocusEditorRef = useRef(onFocusEditor)
  onFocusEditorRef.current = onFocusEditor

  // Auto-init empty outline: only seed for outlines created in this session.
  // Read nodesMap.size directly (not the React snapshot) so StrictMode's double-fire
  // sees the node added by the first invocation and skips the second.
  useEffect(() => {
    if (isNew && nodesMap.size === 0) {
      createNode(outlineDoc, null, "Welcome to Outline")
    }
  }, [outlineDoc, isNew, nodesMap])

  // Auto-select: restore persisted selection if still valid, else fall back to first node
  useEffect(() => {
    if (nodes.length === 0) return
    const current = activeIdRef.current
    if (current && nodes.some((n) => n.id === current)) return
    setActiveId(nodes[0].id)
  }, [nodes])

  const handleSetActive = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const handleSetMode = useCallback((m: "nav" | "insert") => {
    if (m === "insert") {
      const node = nodesRef.current.find((n) => n.id === activeIdRef.current)
      originalTitleRef.current = node ? node.title : ""
    } else {
      originalTitleRef.current = null
    }
    setMode(m)
  }, [])

  const handleUpdateTitle = useCallback(
    (id: string, text: string) => {
      storeUpdateTitle(outlineDoc, id, text)
    },
    [outlineDoc],
  )

  const handleUndo = useCallback(() => {
    undoManager.undo()
  }, [undoManager])

  const handleRedo = useCallback(() => {
    undoManager.redo()
  }, [undoManager])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      const bindings = getBindings()
      const m = (id: string) => matchesBinding(e, bindings[id])

      const currentNodes = nodesRef.current
      const currentActiveId = activeIdRef.current
      const currentMode = modeRef.current
      const idx = currentNodes.findIndex((n) => n.id === currentActiveId)

      if (currentMode === "insert") {
        if (m("insert.cancel")) {
          e.preventDefault()
          if (currentActiveId && originalTitleRef.current !== null) {
            storeUpdateTitle(outlineDoc, currentActiveId, originalTitleRef.current)
          }
          handleSetMode("nav")
        } else if (m("insert.confirm")) {
          e.preventDefault()
          handleSetMode("nav")
        }
        return
      }

      if (currentMode === "nav") {
        const node = currentNodes[idx]

        // Tab is a hardcoded alias for indent/outdent
        if (e.key === "Tab") {
          e.preventDefault()
          if (currentActiveId) {
            if (e.shiftKey) outdentNode(outlineDoc, currentActiveId)
            else indentNode(outlineDoc, currentActiveId)
          }
          return
        }

        if (m("node.undo")) {
          e.preventDefault()
          handleUndo()
          return
        }
        if (m("node.redo")) {
          e.preventDefault()
          handleRedo()
          return
        }

        if (m("node.move-up")) {
          e.preventDefault()
          if (currentActiveId) moveNode(outlineDoc, currentActiveId, "up")
          return
        }
        if (m("node.move-down")) {
          e.preventDefault()
          if (currentActiveId) moveNode(outlineDoc, currentActiveId, "down")
          return
        }
        if (m("node.indent")) {
          e.preventDefault()
          if (currentActiveId) indentNode(outlineDoc, currentActiveId)
          return
        }
        if (m("node.outdent")) {
          e.preventDefault()
          if (currentActiveId) outdentNode(outlineDoc, currentActiveId)
          return
        }

        if (m("node.add-root")) {
          e.preventDefault()
          if (currentActiveId) {
            const newId = addRootSibling(outlineDoc, currentActiveId)
            handleSetActive(newId)
            handleSetMode("insert")
          }
          return
        }
        if (m("node.add-child")) {
          e.preventDefault()
          if (currentActiveId) {
            const parentNode = nodesSnapshotRef.current.get(currentActiveId)
            const templateId = parentNode?.data?.defaultChildTemplateId as string | undefined
            const templateContent = templateId ? getTemplateContentRef.current?.(templateId) : undefined
            const newId = addChild(outlineDoc, currentActiveId, templateContent)
            handleSetActive(newId)
            handleSetMode("insert")
          }
          return
        }
        if (m("node.add-sibling")) {
          e.preventDefault()
          if (currentActiveId) {
            const newId = addSibling(outlineDoc, currentActiveId)
            handleSetActive(newId)
            handleSetMode("insert")
          }
          return
        }

        if (m("node.copy") || m("node.cut")) {
          e.preventDefault()
          if (!currentActiveId) return
          const payload = buildClipboardPayload(currentActiveId, nodesSnapshotRef.current)
          navigator.clipboard
            .write([
              new ClipboardItem({
                "text/html": new Blob([payloadToHtml(payload)], { type: "text/html" }),
                "text/plain": new Blob([payloadToPlainText(payload)], { type: "text/plain" }),
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
          if (m("node.cut")) {
            let nextId: string | null = null
            const nodeToDelete = currentNodes[idx]
            if (idx > 0) {
              nextId = currentNodes[idx - 1].id
            } else if (idx < currentNodes.length - 1) {
              const found = currentNodes
                .slice(idx + 1)
                .find((n) => n.depth <= nodeToDelete.depth)
              if (found) nextId = found.id
            }
            const idToDelete = currentActiveId
            if (nextId) handleSetActive(nextId)
            deleteNode(outlineDoc, idToDelete)
          }
          return
        }
        if (m("node.paste")) {
          return
        }

        if (m("nav.up")) {
          e.preventDefault()
          if (idx > 0) handleSetActive(currentNodes[idx - 1].id)
          return
        }
        if (m("nav.down")) {
          e.preventDefault()
          if (idx < currentNodes.length - 1) handleSetActive(currentNodes[idx + 1].id)
          return
        }
        if (m("nav.expand")) {
          e.preventDefault()
          if (node?.hasChildren && node.collapsed) toggleCollapse(outlineDoc, node.id)
          return
        }
        if (m("nav.collapse")) {
          e.preventDefault()
          if (node?.hasChildren && !node.collapsed) {
            toggleCollapse(outlineDoc, node.id)
          } else {
            for (let i = idx - 1; i >= 0; i--) {
              if (currentNodes[i].depth < node.depth) {
                handleSetActive(currentNodes[i].id)
                break
              }
            }
          }
          return
        }
        if (m("nav.focus-editor")) {
          e.preventDefault()
          onFocusEditorRef.current?.()
          return
        }
        if (m("node.edit")) {
          e.preventDefault()
          handleSetMode("insert")
          return
        }
        if (m("node.delete")) {
          e.preventDefault()
          if (currentActiveId) {
            let nextId: string | null = null
            const nodeToDelete = currentNodes[idx]
            if (idx > 0) {
              nextId = currentNodes[idx - 1].id
            } else if (idx < currentNodes.length - 1) {
              const found = currentNodes
                .slice(idx + 1)
                .find((n) => n.depth <= nodeToDelete.depth)
              if (found) nextId = found.id
            }
            const idToDelete = currentActiveId
            if (nextId) handleSetActive(nextId)
            deleteNode(outlineDoc, idToDelete)
          }
          return
        }
      }
    },
    [outlineDoc, handleSetActive, handleSetMode, handleUndo, handleRedo],
  )

  const handlePasteEvent = useCallback(
    async (e: React.ClipboardEvent) => {
      const currentActiveId = activeIdRef.current
      if (!currentActiveId) return
      e.preventDefault()
      const html = e.clipboardData.getData("text/html") || null
      const plain = e.clipboardData.getData("text/plain") || null
      const payload = parseClipboard(html, plain)
      if (payload.nodes.length === 0) return
      const node = nodesSnapshotRef.current.get(currentActiveId)
      const parentId = node?.parentId ?? null
      const newIds = pasteSubtree(outlineDoc, payload, parentId, currentActiveId)
      if (newIds.length > 0) handleSetActive(newIds[0])
    },
    [outlineDoc, handleSetActive],
  )

  return {
    nodes,
    nodeMap,
    activeId,
    mode,
    setActiveId: handleSetActive,
    setMode: handleSetMode,
    updateTitle: handleUpdateTitle,
    handleKeyDown,
    handlePasteEvent,
    handleUndo,
    handleRedo,
  }
}
