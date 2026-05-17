import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react"
import { plural } from "@lingui/core/macro"
import * as Y from "yjs"
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
  useInstance,
} from "@milkdown/react"
import "@milkdown/crepe/theme/common/style.css"
import { collabServiceCtx } from "@milkdown/plugin-collab"
import { useLiveQuery } from "dexie-react-hooks"
import { DexieYProvider } from "y-dexie"
import type { NodeType } from "@milkdown/prose/model"
import type { EditorView as ProseMirrorEditorView } from "@milkdown/prose/view"
import {
  db,
  TemplateRow,
  consumePendingNodeContent,
  clearPendingContent,
} from "../store"
import { preCacheImagesFromText, revokeAll } from "../utils/imageStore"
import { TriggerInfo } from "../editor/nodeLinkPlugin"
import { CalloutPickerInfo } from "../editor/calloutPlugin"
import { resolveAutoPlaceholders } from "../utils/dateTime"
import { buildCrepeEditor } from "../editor/crepeConfig"
import { useImageCacheRefresh } from "../editor/imageCacheRefresh"
import { NodeLinkSearch } from "./NodeLinkSearch"
import { CalloutColorPicker } from "./CalloutColorPicker"
import { OutletNode, NodeStyle } from "../types"
import { NoteHeader } from "./NoteHeader"
import { Breadcrumbs } from "./Breadcrumbs"
import { EditorOptionsPanel } from "./EditorOptions"
import { useEditorOptions } from "../hooks/useEditorOptions"
import "./EditorView.css"

const LoadedEditor = ({
  doc,
  onCountsChange,
  spellcheck,
  autocorrect,
  getTemplates,
  initialContent,
  getNodes,
  onNavigate,
}: {
  doc: Y.Doc
  onCountsChange: (words: number, chars: number) => void
  spellcheck: boolean
  autocorrect: boolean
  getTemplates?: () => TemplateRow[]
  initialContent?: string
  getNodes: () => OutletNode[]
  onNavigate: (id: string) => void
}) => {
  const getTemplatesRef = useRef(getTemplates)
  getTemplatesRef.current = getTemplates
  const getNodesRef = useRef(getNodes)
  getNodesRef.current = getNodes
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate
  const containerRef = useRef<HTMLDivElement>(null)

  const [triggerInfo, setTriggerInfo] = useState<TriggerInfo | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const editorViewRef = useRef<ProseMirrorEditorView | null>(null)
  const nodeLinkTypeRef = useRef<NodeType | null>(null)

  const onTriggerRef = useRef<
    (info: TriggerInfo | null, view: ProseMirrorEditorView) => void
  >(() => {})
  const onKeyRef = useRef<
    (key: "ArrowUp" | "ArrowDown" | "Enter" | "Escape") => void
  >(() => {})

  const onCalloutPickerRef = useRef<(info: CalloutPickerInfo | null) => void>(
    () => {},
  )
  const [calloutPickerInfo, setCalloutPickerInfo] =
    useState<CalloutPickerInfo | null>(null)
  onCalloutPickerRef.current = (info) => setCalloutPickerInfo(info)

  const filteredNodes = useMemo(() => {
    if (!triggerInfo) return []
    const q = triggerInfo.query.toLowerCase()
    return getNodesRef
      .current()
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [triggerInfo])
  const filteredNodesRef = useRef(filteredNodes)
  filteredNodesRef.current = filteredNodes

  const handleSelect = useCallback(
    (node: OutletNode) => {
      const view = editorViewRef.current
      const info = triggerInfo
      const linkType = nodeLinkTypeRef.current
      if (!view || !info || !linkType) return
      const chip = linkType.create({
        nodeId: node.id,
        label: node.title || node.id,
      })
      view.dispatch(view.state.tr.replaceWith(info.from, info.to, chip))
      view.focus()
      setTriggerInfo(null)
    },
    [triggerInfo],
  )

  onTriggerRef.current = (info, prosView) => {
    editorViewRef.current = prosView
    setTriggerInfo(info)
    if (info) setSelectedIdx(0)
  }

  onKeyRef.current = (key) => {
    const nodes = filteredNodesRef.current
    if (key === "ArrowDown")
      setSelectedIdx((i) => Math.min(i + 1, nodes.length - 1))
    else if (key === "ArrowUp") setSelectedIdx((i) => Math.max(i - 1, 0))
    else if (key === "Enter" && nodes[selectedIdx])
      handleSelect(nodes[selectedIdx])
    // Escape: the plugin dispatches suppress meta → plugin state clears →
    // onTriggerRef(null) → setTriggerInfo(null).
  }

  const [loading, get] = useInstance()

  useEffect(() => {
    if (loading) return
    get().action((ctx) => {
      const collabService = ctx.get(collabServiceCtx)
      const service = collabService.bindDoc(doc)
      if (initialContent) {
        service.applyTemplate(
          resolveAutoPlaceholders(initialContent),
          (yDocNode) => yDocNode.textContent.length === 0,
        )
      }
      service.connect()
    })
    return () => {
      if (loading) return
      get().action((ctx) => {
        ctx.get(collabServiceCtx).disconnect()
      })
    }
    // `get` is stable for the lifetime of MilkdownProvider; `initialContent`
    // is captured once at mount via initialContentRef and shouldn't trigger
    // a reconnect when it changes upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, doc])

  useImageCacheRefresh(loading, get)

  // Forward the editor options to the contenteditable DOM element as
  // ProseMirror creates it (and to any existing one on first mount).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const apply = (el: HTMLElement) => {
      el.setAttribute("spellcheck", spellcheck ? "true" : "false")
      el.setAttribute("autocorrect", autocorrect ? "on" : "off")
      el.setAttribute("autocomplete", "off")
      el.setAttribute("autocapitalize", autocorrect ? "sentences" : "off")
    }

    const existing = container.querySelector<HTMLElement>("[contenteditable]")
    if (existing) apply(existing)

    const observer = new MutationObserver(() => {
      const el = container.querySelector<HTMLElement>("[contenteditable]")
      if (el) apply(el)
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [spellcheck, autocorrect])

  useEditor(
    (root) =>
      buildCrepeEditor({
        root,
        getTemplates: getTemplatesRef.current,
        onTriggerRef,
        onKeyRef,
        nodeLinkTypeRef,
        onNavigateRef,
        onCalloutPickerRef,
        onCountsChange,
      }),
    [],
  )

  return (
    <div ref={containerRef} className="editor-inner">
      <Milkdown />
      {triggerInfo && (
        <NodeLinkSearch
          coords={triggerInfo.coords}
          nodes={filteredNodes}
          selectedIdx={selectedIdx}
          onSelect={handleSelect}
        />
      )}
      {calloutPickerInfo && (
        <CalloutColorPicker
          info={calloutPickerInfo}
          onClose={() => setCalloutPickerInfo(null)}
        />
      )}
    </div>
  )
}

const Editor = ({
  nodeId,
  onCountsChange,
  spellcheck,
  autocorrect,
  getTemplates,
  getNodes,
  onNavigate,
  outlineDoc,
  dataPendingContent,
}: {
  nodeId: string
  onCountsChange: (words: number, chars: number) => void
  spellcheck: boolean
  autocorrect: boolean
  getTemplates?: () => TemplateRow[]
  getNodes: () => OutletNode[]
  onNavigate: (id: string) => void
  outlineDoc?: Y.Doc
  dataPendingContent?: string
}) => {
  // Consume pending template content exactly once at mount for this nodeId.
  const initialContentRef = useRef(
    consumePendingNodeContent(nodeId) ?? dataPendingContent,
  )

  // Clear persisted pendingContent from the outline Y.Doc after consuming it.
  useEffect(() => {
    if (dataPendingContent && outlineDoc) {
      clearPendingContent(outlineDoc, nodeId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const row = useLiveQuery(() => db.nodeContents.get(nodeId), [nodeId])
  const doc = row?.content
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (nodeId) db.nodeContents.add({ nodeId }).catch(() => {})
  }, [nodeId])

  useEffect(() => {
    if (!doc) {
      setLoaded(false)
      return
    }
    const provider = DexieYProvider.load(doc, { gracePeriod: 1000 })
    let active = true
    provider.whenLoaded.then(async () => {
      if (!active) return
      await preCacheImagesFromText(
        doc.getXmlFragment("prosemirror").toString(),
      )
      if (active) setLoaded(true)
    })
    return () => {
      active = false
      setLoaded(false)
      DexieYProvider.release(doc)
      revokeAll()
    }
  }, [doc])

  if (!loaded || !row) return null
  return (
    <MilkdownProvider>
      <LoadedEditor
        doc={doc!}
        onCountsChange={onCountsChange}
        spellcheck={spellcheck}
        autocorrect={autocorrect}
        getTemplates={getTemplates}
        initialContent={initialContentRef.current}
        getNodes={getNodes}
        onNavigate={onNavigate}
      />
    </MilkdownProvider>
  )
}

interface EditorViewProps {
  activeId: string | null
  activeNode: OutletNode | null
  ancestors: { id: string; title: string }[]
  updateTitle: (id: string, title: string) => void
  updateStyle: (id: string, style: Partial<NodeStyle>) => void
  onNavigate: (id: string) => void
  getTemplates?: () => TemplateRow[]
  getNodes: () => OutletNode[]
  onFocusOutline?: () => void
  outlineDoc?: Y.Doc
}

export const EditorView = ({
  activeId,
  activeNode,
  ancestors,
  updateTitle,
  updateStyle,
  onNavigate,
  getTemplates,
  getNodes,
  onFocusOutline,
  outlineDoc,
}: EditorViewProps) => {
  const [words, setWords] = useState(0)
  const [chars, setChars] = useState(0)
  const [options, setOption] = useEditorOptions()

  const { i18n } = useLingui()

  const handleCountsChange = useCallback((w: number, c: number) => {
    setWords(w)
    setChars(c)
  }, [])

  if (!activeId || !activeNode) {
    return (
      <div style={{ padding: "20px", color: "var(--text-secondary)" }}>
        <p>
          <Trans>Select a note to edit...</Trans>
        </p>
      </div>
    )
  }
  return (
    <div
      className="editor-outer"
      onKeyDown={(e) => {
        if (e.key === "Escape") onFocusOutline?.()
      }}
    >
      <Breadcrumbs ancestors={ancestors} onNavigate={onNavigate} />
      <NoteHeader
        node={activeNode}
        onUpdateTitle={updateTitle}
        onUpdateStyle={updateStyle}
        syncStyle={options.syncTitleStyle}
      />
      <div className="editor-container">
        {/* Remount on locale change so Crepe's slash-menu labels rebuild
            with the new translations. A targeted fix would listen to
            i18n.on("change") inside Crepe and rebuild only the menu, but
            locale switching is rare so the full remount is acceptable. */}
        <Editor
          key={`${activeId}-${i18n.locale}`}
          nodeId={activeId}
          onCountsChange={handleCountsChange}
          spellcheck={options.spellcheck}
          autocorrect={options.autocorrect}
          getTemplates={getTemplates}
          getNodes={getNodes}
          onNavigate={onNavigate}
          outlineDoc={outlineDoc}
          dataPendingContent={
            activeNode?.data?.pendingContent as string | undefined
          }
        />
      </div>
      <div className="editor-footer">
        <div className="editor-footer-counts">
          {options.showWords && (
            <span>{plural(words, { one: "# word", other: "# words" })}</span>
          )}
          {options.showChars && (
            <span>
              {plural(chars, { one: "# character", other: "# characters" })}
            </span>
          )}
        </div>
        <EditorOptionsPanel options={options} onSetOption={setOption} />
      </div>
    </div>
  )
}
