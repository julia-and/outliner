import { useState, useEffect, useCallback, useRef } from "react"
import * as Y from "yjs"
import { Crepe, CrepeFeature } from "@milkdown/crepe"
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react"
import "@milkdown/crepe/theme/common/style.css"
import { editorViewCtx, parserCtx, commandsCtx } from "@milkdown/kit/core"
import { clearTextInCurrentBlockCommand } from "@milkdown/kit/preset/commonmark"
import { useLiveQuery } from "dexie-react-hooks"
import { DexieYProvider } from "y-dexie"
import { Settings } from "lucide-react"
import { db, TemplateRow } from "../store"
import { saveImage, getImageURL, getCachedImageURL, revokeAll, preCacheImagesFromText } from "../utils/imageStore"

const IMAGE_UNAVAILABLE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect width="100%" height="100%" fill="#f5f5f5" stroke="#ccc" stroke-dasharray="4" stroke-width="1" rx="4"/><text x="50%" y="50%" font-size="13" font-family="sans-serif" fill="#999" text-anchor="middle" dominant-baseline="middle">Image not available on this device yet</text></svg>')}`
import { OutletNode } from "../types"
import { NoteHeader } from "./NoteHeader"
import { Breadcrumbs } from "./Breadcrumbs"
import { Popover } from "./Popover"
import "./EditorView.css"

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
    .replace(/<[^>]*>/g, " ")       // HTML tags (e.g. <br/>)
    .replace(/&[a-z0-9#]+;/gi, " ") // HTML entities (e.g. &nbsp;)
    .replace(/^#{1,6}\s/gm, "")     // headings
    .replace(/(\*\*|__|\\*|_|~~)/g, "") // bold / italic / strikethrough markers
    .replace(/`[^`]*`/g, (m) => m.slice(1, -1)) // inline code (keep content)
}

function countWords(text: string): number {
  const stripped = stripMarkdownSyntax(text).trim()
  return stripped === "" ? 0 : stripped.split(/\s+/).length
}

const TEMPLATE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`

const LoadedEditor = ({
  doc,
  onCountsChange,
  spellcheck,
  autocorrect,
  getTemplates,
}: {
  doc: Y.Doc
  onCountsChange: (words: number, chars: number) => void
  spellcheck: boolean
  autocorrect: boolean
  getTemplates?: () => TemplateRow[]
}) => {
  const getTemplatesRef = useRef(getTemplates)
  getTemplatesRef.current = getTemplates
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const yText = doc.getText()
    const update = () => {
      const text = yText.toString()
      const clean = stripMarkdownSyntax(text)
      onCountsChange(countWords(text), clean.match(/\S/g)?.length ?? 0)
    }
    update()
    yText.observe(update)
    return () => yText.unobserve(update)
  }, [doc, onCountsChange])

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
    const yText = doc.getText()
    const crepe = new Crepe({
      root,
      defaultValue: yText.toString(),
      featureConfigs: {
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
            return getImageURL(id).then((blobURL) => blobURL ?? IMAGE_UNAVAILABLE_PLACEHOLDER)
          },
        },
        [CrepeFeature.BlockEdit]: {
          buildMenu: (builder) => {
            const templates = getTemplatesRef.current?.() ?? []
            if (templates.length === 0) return
            const group = builder.addGroup("templates", "Templates")
            for (const t of templates) {
              group.addItem(`tpl-${t.id}`, {
                label: t.name,
                icon: TEMPLATE_ICON_SVG,
                onRun: (ctx) => {
                  const commands = ctx.get(commandsCtx)
                  commands.call(clearTextInCurrentBlockCommand.key)
                  const view = ctx.get(editorViewCtx)
                  const parser = ctx.get(parserCtx)
                  const parsed = parser(t.content)
                  if (parsed) {
                    const { state, dispatch } = view
                    dispatch(state.tr.replaceWith(state.selection.from, state.selection.to, parsed.content))
                  }
                },
              })
            }
          },
        },
      },
    })

    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        yText.delete(0, yText.length)
        yText.insert(0, markdown)
      })
    })

    return crepe
  }, [])

  return (
    <div ref={containerRef} className="editor-inner">
      <Milkdown />
    </div>
  )
}

const Editor = ({
  nodeId,
  onCountsChange,
  spellcheck,
  autocorrect,
  getTemplates,
}: {
  nodeId: string
  onCountsChange: (words: number, chars: number) => void
  spellcheck: boolean
  autocorrect: boolean
  getTemplates?: () => TemplateRow[]
}) => {
  const row = useLiveQuery(() => db.nodeContents.get(nodeId), [nodeId])
  const doc = row?.content
  const [loaded, setLoaded] = useState(false)
  const [remountKey, setRemountKey] = useState(0)

  useEffect(() => {
    if (nodeId) db.nodeContents.add({ nodeId } as any).catch(() => {})
  }, [nodeId])

  useEffect(() => {
    if (!doc) { setLoaded(false); return }
    const provider = DexieYProvider.load(doc, { gracePeriod: 1000 })
    let active = true
    provider.whenLoaded.then(async () => {
      if (!active) return
      await preCacheImagesFromText(doc.getText().toString())
      if (active) setLoaded(true)
    })
    return () => {
      active = false
      setLoaded(false)
      DexieYProvider.release(doc)
      revokeAll()
    }
  }, [doc])

  useEffect(() => {
    if (!loaded || !doc) return
    const yText = doc.getText()
    const handler = (_event: Y.YTextEvent, tr: Y.Transaction) => {
      if (!tr.local) setRemountKey(k => k + 1)
    }
    yText.observe(handler)
    return () => yText.unobserve(handler)
  }, [loaded, doc])

  if (!loaded || !row) return null
  return (
    <MilkdownProvider key={remountKey}>
      <LoadedEditor
        doc={doc!}
        onCountsChange={onCountsChange}
        spellcheck={spellcheck}
        autocorrect={autocorrect}
        getTemplates={getTemplates}
      />
    </MilkdownProvider>
  )
}

interface EditorViewProps {
  activeId: string | null
  activeNode: OutletNode | null
  ancestors: { id: string; title: string }[]
  updateTitle: (id: string, title: string) => void
  updateStyle: (id: string, style: Partial<import("../types").NodeStyle>) => void
  onNavigate: (id: string) => void
  getTemplates?: () => TemplateRow[]
}

export const EditorView = ({
  activeId,
  activeNode,
  ancestors,
  updateTitle,
  updateStyle,
  onNavigate,
  getTemplates,
}: EditorViewProps) => {
  const [words, setWords] = useState(0)
  const [chars, setChars] = useState(0)
  const [options, setOptions] = useState<EditorOptions>(loadOptions)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)

  const handleCountsChange = useCallback((w: number, c: number) => {
    setWords(w)
    setChars(c)
  }, [])

  const setOption = <K extends keyof EditorOptions>(key: K, value: EditorOptions[K]) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: value }
      saveOptions(next)
      return next
    })
  }

  if (!activeId || !activeNode) {
    return (
      <div style={{ padding: "20px", color: "var(--text-secondary)" }}>
        <p>Select a note to edit...</p>
      </div>
    )
  }
  return (
    <div className="editor-outer">
      <Breadcrumbs ancestors={ancestors} onNavigate={onNavigate} />
      <NoteHeader node={activeNode} onUpdateTitle={updateTitle} onUpdateStyle={updateStyle} syncStyle={options.syncTitleStyle} />
      <div className="editor-container">
        <Editor
          key={activeId}
          nodeId={activeId}
          onCountsChange={handleCountsChange}
          spellcheck={options.spellcheck}
          autocorrect={options.autocorrect}
          getTemplates={getTemplates}
        />
      </div>
      <div className="editor-footer">
        <div className="editor-footer-counts">
          {options.showWords && (
            <span>{words.toLocaleString()} {words === 1 ? "word" : "words"}</span>
          )}
          {options.showChars && (
            <span>{chars.toLocaleString()} {chars === 1 ? "character" : "characters"}</span>
          )}
        </div>
        <Popover
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          trigger={
            <button
              ref={gearRef}
              className="editor-footer-btn"
              aria-label="Editor options"
              title="Editor options"
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
              Show word count
            </label>
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.showChars}
                onChange={(e) => setOption("showChars", e.target.checked)}
              />
              Show character count
            </label>
            <div className="editor-options-divider" />
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.syncTitleStyle}
                onChange={(e) => setOption("syncTitleStyle", e.target.checked)}
              />
              Sync title style
            </label>
            <div className="editor-options-divider" />
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.spellcheck}
                onChange={(e) => setOption("spellcheck", e.target.checked)}
              />
              Browser spellcheck
            </label>
            <label className="editor-options-item">
              <input
                type="checkbox"
                checked={options.autocorrect}
                onChange={(e) => setOption("autocorrect", e.target.checked)}
              />
              Browser autocorrect
            </label>
          </div>
        </Popover>
      </div>
    </div>
  )
}
