import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import {
  db,
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
} from "../store"
import { getBindings, matchesBinding } from "../utils/shortcuts"
import { NodeData, OutletNode } from "../types"
import {
  buildClipboardPayload,
  payloadToHtml,
  payloadToPlainText,
  parseClipboard,
} from "../utils/clipboard"

function flattenVisibleNodes(allNodes: NodeData[]): OutletNode[] {
  const result: OutletNode[] = []

  const childMap = new Map<string | null, NodeData[]>()
  for (const node of allNodes) {
    const key = node.parentId
    if (!childMap.has(key)) childMap.set(key, [])
    childMap.get(key)!.push(node)
  }
  for (const children of childMap.values()) {
    children.sort((a, b) => a.order - b.order)
  }

  const visit = (node: NodeData, depth: number) => {
    const children = childMap.get(node.id) ?? []
    result.push({
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      depth,
      style: node.style || {},
      collapsed: node.collapsed,
      hasChildren: children.length > 0,
    })
    if (!node.collapsed) {
      for (const child of children) visit(child, depth + 1)
    }
  }

  const roots = childMap.get(null) ?? []
  for (const root of roots) visit(root, 0)

  return result
}

export function useOutline() {
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

  const allNodes = useLiveQuery(() => db.nodes.toArray(), []) ?? []
  const nodeMap = useMemo(
    () => new Map(allNodes.map((n) => [n.id, n])),
    [allNodes],
  )
  const nodes = useMemo(() => flattenVisibleNodes(allNodes), [allNodes])

  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const allNodesRef = useRef(allNodes)
  useEffect(() => {
    allNodesRef.current = allNodes
  }, [allNodes])

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

  const handleSetMode = useCallback(
    (m: "nav" | "insert") => {
      if (m === "insert") {
        const node = nodesRef.current.find((n) => n.id === activeIdRef.current)
        originalTitleRef.current = node ? node.title : ""
      } else {
        originalTitleRef.current = null
      }
      setMode(m)
    },
    [],
  )

  const handleUpdateTitle = useCallback((id: string, text: string) => {
    storeUpdateTitle(id, text)
  }, [])

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
            storeUpdateTitle(currentActiveId, originalTitleRef.current)
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

        // Tab is a hardcoded alias for indent/outdent (always works regardless of remap)
        if (e.key === "Tab") {
          e.preventDefault()
          if (currentActiveId) {
            if (e.shiftKey) outdentNode(currentActiveId)
            else indentNode(currentActiveId)
          }
          return
        }

        // Check modifier+arrow shortcuts before plain arrows
        if (m("node.move-up")) {
          e.preventDefault()
          if (currentActiveId) moveNode(currentActiveId, "up")
          return
        }
        if (m("node.move-down")) {
          e.preventDefault()
          if (currentActiveId) moveNode(currentActiveId, "down")
          return
        }
        if (m("node.indent")) {
          e.preventDefault()
          if (currentActiveId) indentNode(currentActiveId)
          return
        }
        if (m("node.outdent")) {
          e.preventDefault()
          if (currentActiveId) outdentNode(currentActiveId)
          return
        }

        // Check most-specific Enter combos first
        if (m("node.add-root")) {
          e.preventDefault()
          if (currentActiveId) {
            addRootSibling(currentActiveId).then((newId) => {
              handleSetActive(newId)
              handleSetMode("insert")
            })
          }
          return
        }
        if (m("node.add-child")) {
          e.preventDefault()
          if (currentActiveId) {
            addChild(currentActiveId).then((newId) => {
              handleSetActive(newId)
              handleSetMode("insert")
            })
          }
          return
        }
        if (m("node.add-sibling")) {
          e.preventDefault()
          if (currentActiveId) {
            addSibling(currentActiveId).then((newId) => {
              handleSetActive(newId)
              handleSetMode("insert")
            })
          }
          return
        }

        if (m("node.copy") || m("node.cut")) {
          e.preventDefault()
          if (!currentActiveId) return
          const payload = buildClipboardPayload(currentActiveId, allNodesRef.current)
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
            deleteNode(idToDelete)
          }
          return
        }
        if (m("node.paste")) {
          // actual paste is handled via onPaste DOM event
          return
        }

        if (m("nav.up")) {
          e.preventDefault()
          if (idx > 0) handleSetActive(currentNodes[idx - 1].id)
          return
        }
        if (m("nav.down")) {
          e.preventDefault()
          if (idx < currentNodes.length - 1)
            handleSetActive(currentNodes[idx + 1].id)
          return
        }
        if (m("nav.expand")) {
          e.preventDefault()
          if (node?.hasChildren && node.collapsed) toggleCollapse(node.id)
          return
        }
        if (m("nav.collapse")) {
          e.preventDefault()
          if (node?.hasChildren && !node.collapsed) {
            toggleCollapse(node.id)
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
            deleteNode(idToDelete)
          }
          return
        }
      }
    },
    [handleSetActive, handleSetMode],
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
      const node = nodesRef.current.find((n) => n.id === currentActiveId)
      const parentId = node?.parentId ?? null
      const newIds = await pasteSubtree(payload, parentId, currentActiveId)
      if (newIds.length > 0) handleSetActive(newIds[0])
    },
    [handleSetActive],
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
  }
}
