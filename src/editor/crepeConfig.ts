import { t } from "@lingui/core/macro"
import { Crepe, CrepeFeature } from "@milkdown/crepe"
import { editorViewCtx, parserCtx, commandsCtx } from "@milkdown/kit/core"
import { clearTextInCurrentBlockCommand } from "@milkdown/kit/preset/commonmark"
import { collab } from "@milkdown/plugin-collab"
import type { NodeType } from "@milkdown/prose/model"
import { NodeSelection, Plugin } from "@milkdown/prose/state"
import { findWrapping } from "@milkdown/prose/transform"
import type { EditorView as ProseMirrorEditorView } from "@milkdown/prose/view"
import { $prose } from "@milkdown/utils"
import { appCodeMirrorTheme } from "./codeMirrorTheme"
import {
  createNodeLinkPlugins,
  TriggerInfo,
} from "./nodeLinkPlugin"
import {
  createHighlightPlugins,
  highlightMark,
  HIGHLIGHT_COLORS,
} from "./highlightPlugin"
import {
  createCalloutPlugins,
  calloutNode,
  CalloutPickerInfo,
} from "./calloutPlugin"
import {
  createPlaceholderPlugins,
  placeholderNode,
  schedulePlaceholderEditMode,
} from "./placeholderPlugin"
import {
  saveImage,
  getImageURL,
  getCachedImageURL,
} from "../utils/imageStore"
import {
  currentDateString,
  currentTimeString,
  resolveAutoPlaceholders,
} from "../utils/dateTime"
import { getBindings, matchesBinding } from "../utils/shortcuts"
import { TemplateRow } from "../store"

const IMAGE_UNAVAILABLE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect width="100%" height="100%" fill="#f5f5f5" stroke="#ccc" stroke-dasharray="4" stroke-width="1" rx="4"/><text x="50%" y="50%" font-size="13" font-family="sans-serif" fill="#999" text-anchor="middle" dominant-baseline="middle">Image not available on this device yet</text></svg>')}`

const TEMPLATE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`
const CALLOUT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="3"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="12" y2="16"/></svg>`
const PLACEHOLDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`

function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ") // HTML tags (e.g. <br/>)
    .replace(/&[a-z0-9#]+;/gi, " ") // HTML entities (e.g. &nbsp;)
    .replace(/^#{1,6}\s/gm, "") // headings
    .replace(/(\*\*|__|\\*|_|~~)/g, "") // bold / italic / strikethrough markers
    .replace(/`[^`]*`/g, (m) => m.slice(1, -1)) // inline code (keep content)
}

export function countWordsAndChars(markdown: string): {
  words: number
  chars: number
} {
  const stripped = stripMarkdownSyntax(markdown).trim()
  const words = stripped === "" ? 0 : stripped.split(/\s+/).length
  const chars = stripMarkdownSyntax(markdown).match(/\S/g)?.length ?? 0
  return { words, chars }
}

export interface CrepeBuildOptions {
  root: HTMLElement
  getTemplates?: () => TemplateRow[]
  onTriggerRef: React.MutableRefObject<
    (info: TriggerInfo | null, view: ProseMirrorEditorView) => void
  >
  onKeyRef: React.MutableRefObject<
    (key: "ArrowUp" | "ArrowDown" | "Enter" | "Escape") => void
  >
  nodeLinkTypeRef: React.MutableRefObject<NodeType | null>
  onNavigateRef: React.MutableRefObject<(id: string) => void>
  onCalloutPickerRef: React.MutableRefObject<
    (info: CalloutPickerInfo | null) => void
  >
  onCountsChange: (words: number, chars: number) => void
}

export function buildCrepeEditor(opts: CrepeBuildOptions): Crepe {
  const {
    root,
    getTemplates,
    onTriggerRef,
    onKeyRef,
    nodeLinkTypeRef,
    onNavigateRef,
    onCalloutPickerRef,
    onCountsChange,
  } = opts

  const crepe = new Crepe({
    root,
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

          const templates = getTemplates?.() ?? []
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

  // Plugin that consumes the insert.date/time/datetime shortcuts when typed
  // inside the rich-text editor (otherwise they'd bubble up to the outline
  // keyboard dispatch, which only knows how to insert into node titles).
  const dateTimePlugin = $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            const bindings = getBindings()
            const date = bindings["insert.date"]
            const time = bindings["insert.time"]
            const datetime = bindings["insert.datetime"]
            let text: string | null = null
            if (date && matchesBinding(event, date)) text = currentDateString()
            else if (time && matchesBinding(event, time))
              text = currentTimeString()
            else if (datetime && matchesBinding(event, datetime))
              text = `${currentDateString()} ${currentTimeString()}`
            if (!text) return false
            view.dispatch(view.state.tr.insertText(text))
            return true
          },
        },
      }),
  )

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
      const { words, chars } = countWordsAndChars(markdown)
      onCountsChange(words, chars)
    })
  })

  return crepe
}
