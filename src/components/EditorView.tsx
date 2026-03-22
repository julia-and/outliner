import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react"
import { plural } from "@lingui/core/macro"
import * as Y from "yjs"
import { Crepe, CrepeFeature } from "@milkdown/crepe"
import { appCodeMirrorTheme } from "../editor/codeMirrorTheme"
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
  useInstance,
} from "@milkdown/react"
import "@milkdown/crepe/theme/common/style.css"
import { editorViewCtx, parserCtx, commandsCtx } from "@milkdown/kit/core"
import { clearTextInCurrentBlockCommand } from "@milkdown/kit/preset/commonmark"
import { collab, collabServiceCtx } from "@milkdown/plugin-collab"
import { liveQuery } from "dexie"
import { useLiveQuery } from "dexie-react-hooks"
import { DexieYProvider } from "y-dexie"
import { Settings } from "lucide-react"
import type { NodeType } from "@milkdown/prose/model"
import { NodeSelection } from "@milkdown/prose/state"
import type { EditorView as ProseMirrorEditorView } from "@milkdown/prose/view"
import {
  db,
  TemplateRow,
  consumePendingNodeContent,
  clearPendingContent,
} from "../store"
import {
  saveImage,
  getImageURL,
  getCachedImageURL,
  revokeAll,
  preCacheImagesFromText,
} from "../utils/imageStore"
import { createNodeLinkPlugins, TriggerInfo } from "../editor/nodeLinkPlugin"
import {
  createHighlightPlugins,
  highlightMark,
  HIGHLIGHT_COLORS,
} from "../editor/highlightPlugin"
import {
  createCalloutPlugins,
  calloutNode,
  CalloutPickerInfo,
} from "../editor/calloutPlugin"
import {
  createPlaceholderPlugins,
  placeholderNode,
  schedulePlaceholderEditMode,
} from "../editor/placeholderPlugin"
import { $prose } from "@milkdown/utils"
import { Plugin } from "@milkdown/prose/state"
import { findWrapping } from "@milkdown/prose/transform"
import { resolveAutoPlaceholders, currentDateString, currentTimeString } from "../utils/dateTime"
import { getBindings, matchesBinding } from "../utils/shortcuts"
import { NodeLinkSearch } from "./NodeLinkSearch"
import { CalloutColorPicker } from "./CalloutColorPicker"
import { OutletNode } from "../types"
import { NoteHeader } from "./NoteHeader"
import { Breadcrumbs } from "./Breadcrumbs"
import { Popover } from "./Popover"
import "./EditorView.css"

const IMAGE_UNAVAILABLE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect width="100%" height="100%" fill="#f5f5f5" stroke="#ccc" stroke-dasharray="4" stroke-width="1" rx="4"/><text x="50%" y="50%" font-size="13" font-family="sans-serif" fill="#999" text-anchor="middle" dominant-baseline="middle">Image not available on this device yet</text></svg>')}`

interface EditorOptions {
  showWords: boolean
  showChars: boolean
  spellcheck: boolean
  autocorrect: boolean
  syncTitleStyle: boolean
}

const DEFAULT_OPTIONS: EditorOptions = {
  showWords: true,
  showChars: true,
  spellcheck: false,
  autocorrect: false,
  syncTitleStyle: true,
}

const OPTIONS_KEY = "ol-editor-options"

function loadOptions(): EditorOptions {
  try {
    const stored = localStorage.getItem(OPTIONS_KEY)
    if (stored) return { ...DEFAULT_OPTIONS, ...JSON.parse(stored) }
  } catch {}
  return DEFAULT_OPTIONS
}

function saveOptions(opts: EditorOptions) {
  localStorage.setItem(OPTIONS_KEY, JSON.stringify(opts))
}

function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ") // HTML tags (e.g. <br/>)
    .replace(/&[a-z0-9#]+;/gi, " ") // HTML entities (e.g. &nbsp;)
    .replace(/^#{1,6}\s/gm, "") // headings
    .replace(/(\*\*|__|\\*|_|~~)/g, "") // bold / italic / strikethrough markers
    .replace(/`[^`]*`/g, (m) => m.slice(1, -1)) // inline code (keep content)
}

function countWords(text: string): number {
  const stripped = stripMarkdownSyntax(text).trim()
  return stripped === "" ? 0 : stripped.split(/\s+/).length
}

const TEMPLATE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`
const CALLOUT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="3"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="12" y2="16"/></svg>`
const PLACEHOLDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`

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
  getNodes: () => import("../types").OutletNode[]
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
    (node: import("../types").OutletNode) => {
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
    // Escape: plugin dispatches suppress meta → plugin state clears → onTriggerRef(null) → setTriggerInfo(null)
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
  }, [loading, doc])

  // When a synced image arrives in the local DB, cache it and re-trigger
  // proxyDomURL on any image nodes still showing the placeholder by dispatching
  // a setNodeMarkup transaction (same attrs), which causes Milkdown to call
  // proxyDomURL again — at which point the blob URL is in cache.
  useEffect(() => {
    if (loading) return
    const sub = liveQuery(() => db.images.toArray()).subscribe(async (rows) => {
      const uncached = rows.filter((r) => !getCachedImageURL(r.id))
      if (uncached.length === 0) return
      await Promise.all(uncached.map((r) => getImageURL(r.id)))
      get().action((ctx) => {
        const view = ctx.get(editorViewCtx)
        let tr = view.state.tr
        view.state.doc.descendants((node, pos) => {
          if (
            typeof node.attrs?.src !== "string" ||
            !node.attrs.src.startsWith("ol-image://")
          )
            return
          if (!getCachedImageURL(node.attrs.src.slice("ol-image://".length)))
            return
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs })
        })
        view.dispatch(tr)
      })
    })
    return () => sub.unsubscribe()
  }, [loading])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const apply = (el: HTMLElement) => {
      el.setAttribute("spellcheck", spellcheck ? "true" : "false")
      el.setAttribute("autocorrect", autocorrect ? "on" : "off")
      el.setAttribute("autocomplete", "off")
      el.setAttribute("autocapitalize", autocorrect ? "sentences" : "off")
    }

    // Apply to any existing contenteditable
    const existing = container.querySelector<HTMLElement>("[contenteditable]")
    if (existing) apply(existing)

    // Watch for the editor to mount
    const observer = new MutationObserver(() => {
      const el = container.querySelector<HTMLElement>("[contenteditable]")
      if (el) apply(el)
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [spellcheck, autocorrect])

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      featureConfigs: {
        [CrepeFeature.CodeMirror]: {
          theme: appCodeMirrorTheme,
        },
        [CrepeFeature.Placeholder]: {
          text: t`Type / to use the slash menu`,
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: async (file: File) => {
            const id = await saveImage(file)
            return `ol-image://${id}`
          },
          proxyDomURL: (url: string) => {
            if (!url.startsWith("ol-image://")) return url
            const id = url.slice("ol-image://".length)
            // Return synchronously from cache (pre-populated before mount)
            const cached = getCachedImageURL(id)
            if (cached) return cached
            // Async fallback for images arriving after initial load
            return getImageURL(id).then(
              (blobURL) => blobURL ?? IMAGE_UNAVAILABLE_PLACEHOLDER,
            )
          },
        },
        [CrepeFeature.BlockEdit]: {
          textGroup: {
            label: t`Text`,
            text: { label: t`Text` },
            h1: { label: t`Heading 1` },
            h2: { label: t`Heading 2` },
            h3: { label: t`Heading 3` },
            h4: { label: t`Heading 4` },
            h5: { label: t`Heading 5` },
            h6: { label: t`Heading 6` },
            quote: { label: t`Quote` },
            divider: { label: t`Divider` },
          },
          listGroup: {
            label: t`List`,
            bulletList: { label: t`Bullet List` },
            orderedList: { label: t`Ordered List` },
            taskList: { label: t`Task List` },
          },
          advancedGroup: {
            label: t`Advanced`,
            image: { label: t`Image` },
            codeBlock: { label: t`Code` },
            table: { label: t`Table` },
          },
          buildMenu: (builder) => {
            const calloutGroup = builder.addGroup("callout", t`Callout`)
            calloutGroup.addItem("callout", {
              label: t`Callout`,
              icon: CALLOUT_ICON_SVG,
              onRun: (ctx) => {
                const commands = ctx.get(commandsCtx)
                commands.call(clearTextInCurrentBlockCommand.key)
                const view = ctx.get(editorViewCtx)
                const calloutType = calloutNode.type(ctx)
                const { state, dispatch } = view
                const { $from, $to } = state.selection
                const range = $from.blockRange($to)
                if (!range) return
                const wrapping = findWrapping(range, calloutType, {
                  color: "yellow",
                })
                if (wrapping) dispatch(state.tr.wrap(range, wrapping))
              },
            })

            const placeholderGroup = builder.addGroup(
              "placeholders",
              t`Placeholders`,
            )
            placeholderGroup.addItem("placeholder", {
              label: t`Placeholder`,
              icon: PLACEHOLDER_ICON_SVG,
              onRun: (ctx) => {
                const commands = ctx.get(commandsCtx)
                commands.call(clearTextInCurrentBlockCommand.key)
                const view = ctx.get(editorViewCtx)
                const node = placeholderNode
                  .type(ctx)
                  .create({ label: t`Placeholder` })
                const { state } = view
                const insertPos = state.selection.from
                const tr = state.tr.replaceSelectionWith(node)
                tr.setSelection(NodeSelection.create(tr.doc, insertPos))
                schedulePlaceholderEditMode()
                view.dispatch(tr)
              },
            })

            const templates = getTemplatesRef.current?.() ?? []
            if (templates.length === 0) return
            const group = builder.addGroup("templates", t`Templates`)
            for (const tmpl of templates) {
              group.addItem(`tpl-${tmpl.id}`, {
                label: tmpl.name,
                icon: TEMPLATE_ICON_SVG,
                onRun: (ctx) => {
                  const commands = ctx.get(commandsCtx)
                  commands.call(clearTextInCurrentBlockCommand.key)
                  const view = ctx.get(editorViewCtx)
                  const parser = ctx.get(parserCtx)
                  const parsed = parser(resolveAutoPlaceholders(tmpl.content))
                  if (parsed) {
                    const { state, dispatch } = view
                    dispatch(
                      state.tr.replaceWith(
                        state.selection.from,
                        state.selection.to,
                        parsed.content,
                      ),
                    )
                  }
                },
              })
            }
          },
        },
        [CrepeFeature.Toolbar]: {
          buildToolbar: (builder) => {
            const group = builder.addGroup("highlight", t`Highlight`)
            for (const { key } of HIGHLIGHT_COLORS) {
              group.addItem(`highlight-${key}`, {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="var(--highlight-${key})"/></svg>`,
                active: (ctx) => {
                  const view = ctx.get(editorViewCtx)
                  const { from, to } = view.state.selection
                  const markType = highlightMark.type(ctx)
                  let found = false
                  view.state.doc.nodesBetween(from, to, (node) => {
                    if (found) return false
                    if (
                      node.marks.some(
                        (m) => m.type === markType && m.attrs.color === key,
                      )
                    )
                      found = true
                    return true
                  })
                  return found
                },
                onRun: (ctx) => {
                  const view = ctx.get(editorViewCtx)
                  const { from, to } = view.state.selection
                  const markType = highlightMark.type(ctx)
                  const alreadyActive = (() => {
                    let found = false
                    view.state.doc.nodesBetween(from, to, (node) => {
                      if (found) return false
                      if (
                        node.marks.some(
                          (m) => m.type === markType && m.attrs.color === key,
                        )
                      )
                        found = true
                      return true
                    })
                    return found
                  })()
                  if (alreadyActive) {
                    view.dispatch(view.state.tr.removeMark(from, to, markType))
                  } else {
                    view.dispatch(
                      view.state.tr.addMark(
                        from,
                        to,
                        markType.create({ color: key }),
                      ),
                    )
                  }
                },
              })
            }
            group.addItem("highlight-clear", {
              icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
              active: () => false,
              onRun: (ctx) => {
                const view = ctx.get(editorViewCtx)
                const { from, to } = view.state.selection
                view.dispatch(
                  view.state.tr.removeMark(from, to, highlightMark.type(ctx)),
                )
              },
            })
          },
        },
      },
    })

    const nodeLinkPlugins = createNodeLinkPlugins({
      onNavigateRef,
      onTriggerRef,
      onKeyRef,
      nodeLinkTypeRef,
    })
    const highlightPlugins = createHighlightPlugins()
    const calloutPlugins = createCalloutPlugins({
      onPickerRef: onCalloutPickerRef,
    })
    const placeholderPlugins = createPlaceholderPlugins()
    const dateTimePlugin = $prose(() => new Plugin({
      props: {
        handleKeyDown(view, event) {
          const bindings = getBindings()
          let text: string | null = null
          if (matchesBinding(event, bindings["insert.date"])) text = currentDateString()
          else if (matchesBinding(event, bindings["insert.time"])) text = currentTimeString()
          else if (matchesBinding(event, bindings["insert.datetime"])) text = `${currentDateString()} ${currentTimeString()}`
          if (!text) return false
          view.dispatch(view.state.tr.insertText(text))
          return true
        },
      },
    }))
    crepe.editor.use([
      ...nodeLinkPlugins,
      ...highlightPlugins,
      ...calloutPlugins,
      ...placeholderPlugins,
      dateTimePlugin,
    ])
    crepe.editor.use(collab)

    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        const clean = stripMarkdownSyntax(markdown)
        onCountsChange(countWords(markdown), clean.match(/\S/g)?.length ?? 0)
      })
    })

    return crepe
  }, [])

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
  getNodes: () => import("../types").OutletNode[]
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
    if (nodeId) db.nodeContents.add({ nodeId } as any).catch(() => {})
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
      await preCacheImagesFromText(doc.getXmlFragment("prosemirror").toString())
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
  updateStyle: (
    id: string,
    style: Partial<import("../types").NodeStyle>,
  ) => void
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
  const [options, setOptions] = useState<EditorOptions>(loadOptions)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)

  const { i18n } = useLingui()

  const handleCountsChange = useCallback((w: number, c: number) => {
    setWords(w)
    setChars(c)
  }, [])

  const setOption = <K extends keyof EditorOptions>(
    key: K,
    value: EditorOptions[K],
  ) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: value }
      saveOptions(next)
      return next
    })
  }

  if (!activeId || !activeNode) {
    return (
      <div style={{ padding: "20px", color: "var(--text-secondary)" }}>
        <p><Trans>Select a note to edit...</Trans></p>
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
            <span>
              {plural(words, { one: "# word", other: "# words" })}
            </span>
          )}
          {options.showChars && (
            <span>
              {plural(chars, { one: "# character", other: "# characters" })}
            </span>
          )}
        </div>
        <Popover
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          trigger={
            <button
              ref={gearRef}
              className="editor-footer-btn"
              aria-label={t`Editor options`}
              title={t`Editor options`}
            >
              <Settings size={13} />
            </button>
          }
          placement="top-end"
          offset={8}
        >
          <div className="editor-options">
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.showWords}
                onChange={(e) => setOption("showWords", e.target.checked)}
              />
              <Trans>Show word count</Trans>
            </label>
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.showChars}
                onChange={(e) => setOption("showChars", e.target.checked)}
              />
              <Trans>Show character count</Trans>
            </label>
            <div className="editor-options-divider" />
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.syncTitleStyle}
                onChange={(e) => setOption("syncTitleStyle", e.target.checked)}
              />
              <Trans>Sync title style</Trans>
            </label>
            <div className="editor-options-divider" />
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.spellcheck}
                onChange={(e) => setOption("spellcheck", e.target.checked)}
              />
              <Trans>Browser spellcheck</Trans>
            </label>
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.autocorrect}
                onChange={(e) => setOption("autocorrect", e.target.checked)}
              />
              <Trans>Browser autocorrect</Trans>
            </label>
          </div>
        </Popover>
      </div>
    </div>
  )
}
