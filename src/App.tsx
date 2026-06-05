import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Trans } from "@lingui/react/macro"
import * as Y from "yjs"
import { DexieYProvider } from "y-dexie"
import { useLiveQuery } from "dexie-react-hooks"
import { useOutline } from "./hooks/useOutline"
import { SplitLayout } from "./components/SplitLayout"
import { OutlineView } from "./components/OutlineView"
import { EditorView } from "./components/EditorView"
import { OutlineSwitcher } from "./components/OutlineSwitcher"
import { TemplateManager } from "./components/TemplateManager"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { db, getActiveOutlineId, setActiveOutlineId, createOutline, getNodesMap, getAncestors, updateStyle, consumeIsJustCreated } from "./store"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { initMenuBridge, onMenuCommand } from "./desktop/menuBridge"
import { NodeYRecord } from "./types"

export const App = ({ initPromise }: { initPromise: Promise<boolean> }) => {
  const [ready, setReady] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [activeOutlineId, setActiveOutlineIdState] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    initPromise.then((isFirstRun) => {
      setActiveOutlineIdState(getActiveOutlineId())
      setNeedsSetup(isFirstRun)
      setReady(true)
    })
  }, [initPromise])

  useEffect(() => {
    const handler = () => setUpdateAvailable(true)
    window.addEventListener("sw-update-available", handler)
    return () => window.removeEventListener("sw-update-available", handler)
  }, [])

  // Bridge native (Tauri) menu clicks into window "ol:command" events.
  useEffect(() => initMenuBridge(), [])

  const handleUpdate = useCallback(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" })
    window.location.reload()
  }, [])

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

  const handleCreateLocal = useCallback(async (name: string) => {
    const id = await createOutline(name)
    setActiveOutlineId(id)
    setActiveOutlineIdState(id)
  }, [])

  if (!ready) {
    return (
      <SplitLayout
        left={<div style={{ padding: "20px", color: "var(--text-secondary)" }}><Trans>Loading…</Trans></div>}
        right={null}
      />
    )
  }

  if (needsSetup && !activeOutlineId) {
    return <WelcomeScreen onCreateLocal={handleCreateLocal} />
  }

  return (
    <>
      <OutlineLoader
        outlineId={activeOutlineId}
        onSelectOutline={handleSelectOutline}
      />
      {updateAvailable && <UpdateBanner onUpdate={handleUpdate} />}
    </>
  )
}

// Manual refresh by design: an auto-reload would interrupt typing in the
// editor and the user can keep working on a stale bundle indefinitely.
// Users who dismiss this banner get the new build on their next page load.
const UpdateBanner = ({ onUpdate }: { onUpdate: () => void }) => (
  <div style={{
    position: "fixed",
    bottom: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    boxShadow: "0 4px 12px var(--popover-shadow)",
    fontSize: "13px",
    color: "var(--text-primary)",
    zIndex: 9999,
    whiteSpace: "nowrap",
  }}>
    <Trans>A new version is available.</Trans>
    <button
      onClick={onUpdate}
      style={{
        background: "var(--resizer-active)",
        color: "#fff",
        border: "none",
        borderRadius: "5px",
        padding: "4px 12px",
        fontSize: "13px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <Trans>Refresh</Trans>
    </button>
  </div>
)

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
        left={<div style={{ padding: "20px", color: "var(--text-secondary)" }}><Trans>Loading…</Trans></div>}
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
  const templatesData = useLiveQuery(() => db.templates.orderBy("createdAt").toArray(), [])
  const templates = useMemo(() => templatesData ?? [], [templatesData])
  const templatesById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates])
  const getTemplateContent = useCallback((id: string) => templatesById.get(id)?.content, [templatesById])
  const getTemplates = useCallback(() => templates, [templates])

  const outlineContainerRef = useRef<HTMLDivElement>(null)
  const focusOutline = useCallback(() => outlineContainerRef.current?.focus(), [])
  const focusEditor = useCallback(() => document.querySelector<HTMLElement>(".ProseMirror")?.focus(), [])

  const outline = useOutline(outlineDoc, isNewRef.current, getTemplateContent, focusEditor)

  // Native (Tauri) Outline-menu commands → run the matching node op on the
  // active node. Ids mirror the shortcut ids in NAV_HANDLERS.
  const runCommand = outline.runCommand
  useEffect(() => {
    const ids = [
      "node.indent",
      "node.outdent",
      "node.move-up",
      "node.move-down",
      "node.add-sibling",
      "node.add-child",
      "node.add-root",
      "node.edit",
      "node.delete",
      "format.bold",
      "format.italic",
      "format.strikethrough",
    ]
    const unsubs = ids.map((id) => onMenuCommand(id, () => runCommand(id)))
    return () => unsubs.forEach((u) => u())
  }, [runCommand])

  // Native (Tauri) Edit-menu commands, dispatched by mode: nav → node ops,
  // insert (text field / editor focused) → native text editing. Mode is read
  // through a ref so the listeners subscribe once. The menu items carry no
  // accelerators, so keyboard ⌘C/⌘Z/… still flow to the webview/app unshadowed.
  const modeRef = useRef(outline.mode)
  modeRef.current = outline.mode
  const { handleUndo, handleRedo, pasteFromClipboard } = outline
  useEffect(() => {
    const insert = () => modeRef.current === "insert"
    const exec = (cmd: string) => {
      document.execCommand(cmd)
    }
    const unsubs = [
      onMenuCommand("edit.undo", () =>
        insert() ? exec("undo") : handleUndo(),
      ),
      onMenuCommand("edit.redo", () =>
        insert() ? exec("redo") : handleRedo(),
      ),
      onMenuCommand("edit.copy", () =>
        insert() ? exec("copy") : runCommand("node.copy"),
      ),
      onMenuCommand("edit.cut", () =>
        insert() ? exec("cut") : runCommand("node.cut"),
      ),
      onMenuCommand("edit.paste", () =>
        insert() ? exec("paste") : void pasteFromClipboard(),
      ),
      onMenuCommand("edit.select-all", () => {
        if (insert()) exec("selectAll")
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [runCommand, handleUndo, handleRedo, pasteFromClipboard])

  const getNodes = useCallback(() => outline.nodes, [outline.nodes])
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
      templateManager={<TemplateManager />}
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
          templates={templates}
          containerRef={outlineContainerRef}
        />
      }
      right={
        <ErrorBoundary key={outline.activeId ?? "none"}>
          <EditorView
            activeId={outline.activeId}
            activeNode={activeNode}
            ancestors={ancestors}
            updateTitle={outline.updateTitle}
            updateStyle={(id, style) => updateStyle(outlineDoc, id, style)}
            onNavigate={outline.setActiveId}
            getTemplates={getTemplates}
            getNodes={getNodes}
            onFocusOutline={focusOutline}
            outlineDoc={outlineDoc}
          />
        </ErrorBoundary>
      }
    />
  )
}
