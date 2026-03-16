import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import * as Y from "yjs"
import { DexieYProvider } from "y-dexie"
import { useLiveQuery } from "dexie-react-hooks"
import { useOutline } from "./hooks/useOutline"
import { SplitLayout } from "./components/SplitLayout"
import { OutlineView } from "./components/OutlineView"
import { EditorView } from "./components/EditorView"
import { OutlineSwitcher } from "./components/OutlineSwitcher"
import { db, getActiveOutlineId, setActiveOutlineId, getNodesMap, getAncestors, updateStyle, consumeIsJustCreated } from "./store"
import { NodeYRecord } from "./types"

export const App = ({ initPromise }: { initPromise: Promise<void> }) => {
  const [ready, setReady] = useState(false)
  const [activeOutlineId, setActiveOutlineIdState] = useState<string | null>(null)

  useEffect(() => {
    initPromise.then(() => {
      setActiveOutlineIdState(getActiveOutlineId())
      setReady(true)
    })
  }, [initPromise])

  // When cloud sync delivers outlines but we have no active outline yet, auto-select the first one
  useLiveQuery(async () => {
    if (!ready || activeOutlineId) return
    const first = await db.outlines.orderBy("createdAt").first()
    if (first) {
      setActiveOutlineIdState(first.id)
      setActiveOutlineId(first.id)
    }
  }, [ready, activeOutlineId])

  const handleSelectOutline = useCallback((id: string) => {
    setActiveOutlineIdState(id)
    setActiveOutlineId(id)
  }, [])

  if (!ready) {
    return (
      <SplitLayout
        left={<div style={{ padding: "20px", color: "var(--text-secondary)" }}>Loading…</div>}
        right={null}
      />
    )
  }

  return (
    <OutlineLoader
      outlineId={activeOutlineId}
      onSelectOutline={handleSelectOutline}
    />
  )
}

const OutlineLoader = ({
  outlineId,
  onSelectOutline,
}: {
  outlineId: string | null
  onSelectOutline: (id: string) => void
}) => {
  const outline = useLiveQuery(
    () => (outlineId ? db.outlines.get(outlineId) : undefined),
    [outlineId],
  )
  const doc = outline?.content
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!doc) { setLoaded(false); return }
    const provider = DexieYProvider.load(doc, { gracePeriod: 1000 })
    let active = true
    provider.whenLoaded.then(() => { if (active) setLoaded(true) })
    return () => {
      active = false
      setLoaded(false)
      DexieYProvider.release(doc)
    }
  }, [doc])

  const switcher = (
    <OutlineSwitcher activeOutlineId={outlineId} onSelect={onSelectOutline} />
  )

  if (!loaded || !outline) {
    return (
      <SplitLayout
        outlineSwitcher={switcher}
        left={<div style={{ padding: "20px", color: "var(--text-secondary)" }}>Loading…</div>}
        right={null}
      />
    )
  }

  return (
    <OutlineWorkspace
      outlineId={outlineId!}
      outlineDoc={doc!}
      onSelectOutline={onSelectOutline}
    />
  )
}

const OutlineWorkspace = ({
  outlineId,
  outlineDoc,
  onSelectOutline,
}: {
  outlineId: string
  outlineDoc: Y.Doc
  onSelectOutline: (id: string) => void
}) => {
  const isNewRef = useRef(consumeIsJustCreated(outlineId))
  const outline = useOutline(outlineDoc, isNewRef.current)
  const activeNode = outline.nodes.find((n) => n.id === outline.activeId) ?? null
  const nodesMap = useMemo(() => getNodesMap(outlineDoc) as Y.Map<NodeYRecord>, [outlineDoc])
  const ancestors = useMemo(
    () => (outline.activeId ? getAncestors(nodesMap, outline.activeId) : []),
    [nodesMap, outline.activeId],
  )

  return (
    <SplitLayout
      outlineSwitcher={
        <OutlineSwitcher activeOutlineId={outlineId} onSelect={onSelectOutline} />
      }
      left={
        <OutlineView
          outlineDoc={outlineDoc}
          nodes={outline.nodes}
          activeId={outline.activeId}
          mode={outline.mode}
          setActiveId={outline.setActiveId}
          setMode={outline.setMode}
          updateTitle={outline.updateTitle}
          handleKeyDown={outline.handleKeyDown}
          handlePasteEvent={outline.handlePasteEvent}
        />
      }
      right={
        <EditorView
          activeId={outline.activeId}
          activeNode={activeNode}
          ancestors={ancestors}
          updateTitle={outline.updateTitle}
          updateStyle={(id, style) => updateStyle(outlineDoc, id, style)}
          onNavigate={outline.setActiveId}
        />
      }
    />
  )
}
