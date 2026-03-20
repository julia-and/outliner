import { $mark, $inputRule, $remark } from "@milkdown/utils"
import { markRule } from "@milkdown/prose"

export const HIGHLIGHT_COLORS = [
  { key: "yellow", label: "Yellow" },
  { key: "green", label: "Green" },
  { key: "blue", label: "Blue" },
  { key: "rose", label: "Rose" },
  { key: "orange", label: "Orange" },
  { key: "purple", label: "Purple" },
]

// Walk MDAST tree in reverse order so splices don't break indices
function walk(node: any, fn: (node: any, idx: number, parent: any) => void) {
  if (node.children) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      fn(node.children[i], i, node)
      walk(node.children[i], fn)
    }
  }
}

function remarkHighlightPlugin(this: any) {
  // Register to-markdown handler so ==text== round-trips correctly
  const data = this.data() as any
  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = []
  data.toMarkdownExtensions.push({
    handlers: {
      highlight(node: any) {
        const color = node.data?.color ?? "yellow"
        const prefix = color === "yellow" ? "==" : `=={${color}}`
        const text = node.children?.map((c: any) => c.value ?? "").join("") ?? ""
        return `${prefix}${text}==`
      },
    },
  })

  // Transform text nodes containing ==...== into highlight AST nodes
  return (tree: any) => {
    walk(tree, (node: any, index: number, parent: any) => {
      if (node.type !== "text" || !parent) return
      const re = /==(?:\{([^}]+)\})?([^=\n]+)==/g
      let match
      const parts: any[] = []
      let lastIndex = 0

      re.lastIndex = 0
      while ((match = re.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) })
        }
        const color = match[1] ?? "yellow"
        const text = match[2]
        parts.push({
          type: "highlight",
          data: { color },
          children: [{ type: "text", value: text }],
        })
        lastIndex = match.index + match[0].length
      }

      if (parts.length === 0) return

      if (lastIndex < node.value.length) {
        parts.push({ type: "text", value: node.value.slice(lastIndex) })
      }

      parent.children.splice(index, 1, ...parts)
    })
  }
}

export const highlightMark = $mark("highlight", () => ({
  attrs: { color: { default: "yellow" } },
  parseDOM: [
    {
      tag: "mark[data-highlight-color]",
      getAttrs: (dom: HTMLElement | string) => {
        if (typeof dom === "string") return false
        return { color: (dom as HTMLElement).getAttribute("data-highlight-color") ?? "yellow" }
      },
    },
  ],
  toDOM: (mark: import("@milkdown/prose/model").Mark) => [
    "mark",
    {
      "data-highlight-color": mark.attrs.color,
      style: `background-color: var(--highlight-${mark.attrs.color})`,
    },
  ],
  parseMarkdown: {
    match: (node: any) => node.type === "highlight",
    runner: (state: any, node: any, markType: import("@milkdown/prose/model").MarkType) => {
      state.openMark(markType, { color: node.data?.color ?? "yellow" })
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark: import("@milkdown/prose/model").Mark) => mark.type.name === "highlight",
    runner: (state: any, mark: import("@milkdown/prose/model").Mark) => {
      state.withMark(mark, "highlight", undefined, { color: mark.attrs.color })
    },
  },
}))

export function createHighlightPlugins() {
  const remarkHighlightPlugins = $remark("highlight", () => remarkHighlightPlugin)

  const highlightInputRule = $inputRule((ctx) =>
    markRule(/==(?:\{([^}]+)\})?([^=\n]+)==$/, highlightMark.type(ctx), {
      getAttr: (match: RegExpMatchArray) => ({ color: match[1] ?? "yellow" }),
    }),
  )

  return [...remarkHighlightPlugins, highlightMark, highlightInputRule] as const
}
