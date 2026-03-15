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
} from "../store"
import { isCmd } from "../utils/keyboard"
import { NodeData, OutletNode } from "../types"

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
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mode, setMode] = useState<"nav" | "insert">("nav")

  const activeIdRef = useRef(activeId)
  const modeRef = useRef(mode)
  const originalTitleRef = useRef<string | null>(null)

  useEffect(() => {
    activeIdRef.current = activeId
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

  // Auto-select first node
  useEffect(() => {
    if (!activeIdRef.current && nodes.length > 0) {
      setActiveId(nodes[0].id)
    }
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
      const currentNodes = nodesRef.current
      const currentActiveId = activeIdRef.current
      const currentMode = modeRef.current

      const idx = currentNodes.findIndex((n) => n.id === currentActiveId)

      if (currentMode === "insert") {
        if (e.key === "Escape") {
          e.preventDefault()
          if (currentActiveId && originalTitleRef.current !== null) {
            storeUpdateTitle(currentActiveId, originalTitleRef.current)
          }
          handleSetMode("nav")
        } else if (e.key === "Enter") {
          e.preventDefault()
          handleSetMode("nav")
        }
        return
      }

      if (currentMode === "nav") {
        const node = currentNodes[idx]

        if (isCmd(e)) {
          if (e.key === "ArrowUp") {
            e.preventDefault()
            if (currentActiveId) moveNode(currentActiveId, "up")
            return
          }
          if (e.key === "ArrowDown") {
            e.preventDefault()
            if (currentActiveId) moveNode(currentActiveId, "down")
            return
          }
          if (e.key === "ArrowRight") {
            e.preventDefault()
            if (currentActiveId) indentNode(currentActiveId)
            return
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault()
            if (currentActiveId) outdentNode(currentActiveId)
            return
          }
        }

        if (e.key === "Tab") {
          e.preventDefault()
          if (currentActiveId) {
            if (e.shiftKey) outdentNode(currentActiveId)
            else indentNode(currentActiveId)
          }
          return
        }

        switch (e.key) {
          case "ArrowUp":
            e.preventDefault()
            if (idx > 0) handleSetActive(currentNodes[idx - 1].id)
            break
          case "ArrowDown":
            e.preventDefault()
            if (idx < currentNodes.length - 1)
              handleSetActive(currentNodes[idx + 1].id)
            break
          case "ArrowRight":
            e.preventDefault()
            if (node?.hasChildren && node.collapsed) toggleCollapse(node.id)
            break
          case "ArrowLeft":
            e.preventDefault()
            if (node?.hasChildren && !node.collapsed) toggleCollapse(node.id)
            else {
              for (let i = idx - 1; i >= 0; i--) {
                if (currentNodes[i].depth < node.depth) {
                  handleSetActive(currentNodes[i].id)
                  break
                }
              }
            }
            break
          case "Enter":
            e.preventDefault()
            if (isCmd(e) && e.shiftKey && currentActiveId) {
              addRootSibling(currentActiveId).then((newId) => {
                handleSetActive(newId)
                handleSetMode("insert")
              })
              return
            }
            if (isCmd(e) && currentActiveId) {
              addChild(currentActiveId).then((newId) => {
                handleSetActive(newId)
                handleSetMode("insert")
              })
            } else if (currentActiveId) {
              addSibling(currentActiveId).then((newId) => {
                handleSetActive(newId)
                handleSetMode("insert")
              })
            }
            break
          case "i":
            e.preventDefault()
            handleSetMode("insert")
            break
          case "Backspace":
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
            break
        }
      }
    },
    [handleSetActive, handleSetMode],
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
  }
}
