import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useSyncExternalStore,
} from "react"
import * as Y from "yjs"
import {
  updateTitle as storeUpdateTitle,
  getActiveNodeId,
  setActiveNodeId,
  pasteSubtree,
  createNode,
  getNodesMap,
} from "../store"
import { NodeYRecord, OutletNode } from "../types"
import { parseClipboard } from "../utils/clipboard"
import { dispatchOutlineKey, OutlineKeyContext } from "./outlineKeyboard"

function flattenVisibleNodes(
  nodesSnapshot: Map<string, NodeYRecord>,
): OutletNode[] {
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
      for (const [childId, childNode] of children)
        visit(childId, childNode, depth + 1)
    }
  }

  const roots = childMap.get(null) ?? []
  for (const [id, node] of roots) visit(id, node, 0)

  return result
}

function useNodesSnapshot(
  nodesMap: Y.Map<NodeYRecord>,
): Map<string, NodeYRecord> {
  const cacheRef = useRef<{
    map: Y.Map<NodeYRecord>
    snapshot: Map<string, NodeYRecord>
  }>({
    map: nodesMap,
    snapshot: new Map(nodesMap.entries()),
  })

  // Synchronously update cache if nodesMap changed (outline switch)
  if (cacheRef.current.map !== nodesMap) {
    cacheRef.current = {
      map: nodesMap,
      snapshot: new Map(nodesMap.entries()),
    }
  }

  const subscribe = useCallback(
    (cb: () => void) => {
      const handler = () => {
        cacheRef.current = {
          ...cacheRef.current,
          snapshot: new Map(nodesMap.entries()),
        }
        cb()
      }
      nodesMap.observeDeep(handler)
      return () => nodesMap.unobserveDeep(handler)
    },
    [nodesMap],
  )

  const getSnapshot = useCallback(() => cacheRef.current.snapshot, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Snapshot of everything the keyboard dispatch and other handlers need to
// read synchronously. Updated in render so every handler always sees the
// latest state without scheduling.
interface LiveState {
  activeId: string | null
  mode: "nav" | "insert"
  nodes: OutletNode[]
  nodeMap: Map<string, NodeYRecord>
  getTemplateContent?: (id: string) => string | undefined
  onFocusEditor?: () => void
}

export function useOutline(
  outlineDoc: Y.Doc,
  isNew = false,
  getTemplateContent?: (templateId: string) => string | undefined,
  onFocusEditor?: () => void,
) {
  const [activeId, setActiveId] = useState<string | null>(getActiveNodeId)
  const [mode, setMode] = useState<"nav" | "insert">("nav")

  // originalTitle is plain mutable state (not React state) — handlers read
  // and write it directly, no re-render needed.
  const originalTitleRef = useRef<string | null>(null)

  const nodesMap = useMemo(() => getNodesMap(outlineDoc), [outlineDoc])
  const undoManager = useMemo(
    () => new Y.UndoManager(nodesMap, { captureTimeout: 500 }),
    [nodesMap],
  )

  const nodesSnapshot = useNodesSnapshot(nodesMap)
  const nodes = useMemo(
    () => flattenVisibleNodes(nodesSnapshot),
    [nodesSnapshot],
  )

  // Single liveRef for handlers to read. Assigned in render so it always
  // reflects the latest render's state without needing a useEffect chain.
  const liveRef = useRef<LiveState>({
    activeId,
    mode,
    nodes,
    nodeMap: nodesSnapshot,
    getTemplateContent,
    onFocusEditor,
  })
  liveRef.current = {
    activeId,
    mode,
    nodes,
    nodeMap: nodesSnapshot,
    getTemplateContent,
    onFocusEditor,
  }

  useEffect(() => {
    setActiveNodeId(activeId)
  }, [activeId])

  // Auto-init empty outline: only seed for outlines created in this session.
  // Read nodesMap.size directly (not the React snapshot) so StrictMode's
  // double-fire sees the node added by the first invocation and skips the
  // second.
  useEffect(() => {
    if (isNew && nodesMap.size === 0) {
      createNode(outlineDoc, null, "Welcome to Outline")
    }
  }, [outlineDoc, isNew, nodesMap])

  // Auto-select: restore persisted selection if still valid, else fall back
  // to first node.
  useEffect(() => {
    if (nodes.length === 0) return
    const current = liveRef.current.activeId
    if (current && nodes.some((n) => n.id === current)) return
    setActiveId(nodes[0].id)
  }, [nodes])

  const handleSetActive = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const handleSetMode = useCallback((m: "nav" | "insert", forId?: string) => {
    if (m === "insert") {
      const id = forId ?? liveRef.current.activeId
      const node = liveRef.current.nodes.find((n) => n.id === id)
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

  const handleUndo = useCallback(() => undoManager.undo(), [undoManager])
  const handleRedo = useCallback(() => undoManager.redo(), [undoManager])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      const live = liveRef.current
      const idx = live.nodes.findIndex((n) => n.id === live.activeId)
      const ctx: OutlineKeyContext = {
        e,
        doc: outlineDoc,
        nodes: live.nodes,
        nodeMap: live.nodeMap,
        activeId: live.activeId,
        idx,
        setActive: handleSetActive,
        setMode: handleSetMode,
        undo: handleUndo,
        redo: handleRedo,
        focusEditor: live.onFocusEditor,
        getTemplateContent: live.getTemplateContent,
        originalTitleRef,
      }
      dispatchOutlineKey(ctx, live.mode)
    },
    [outlineDoc, handleSetActive, handleSetMode, handleUndo, handleRedo],
  )

  const handlePasteEvent = useCallback(
    async (e: React.ClipboardEvent) => {
      const live = liveRef.current
      if (!live.activeId) return
      e.preventDefault()
      const html = e.clipboardData.getData("text/html") || null
      const plain = e.clipboardData.getData("text/plain") || null
      const payload = parseClipboard(html, plain)
      if (payload.nodes.length === 0) return
      const node = live.nodeMap.get(live.activeId)
      const parentId = node?.parentId ?? null
      const newIds = pasteSubtree(outlineDoc, payload, parentId, live.activeId)
      if (newIds.length > 0) handleSetActive(newIds[0])
    },
    [outlineDoc, handleSetActive],
  )

  return {
    nodes,
    nodeMap: nodesSnapshot,
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
