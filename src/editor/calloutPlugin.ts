import React from "react"
import { $node, $view, $remark } from "@milkdown/utils"
import type { EditorView } from "@milkdown/prose/view"

export const CALLOUT_COLORS = [
  { key: "yellow", label: "Yellow" },
  { key: "green", label: "Green" },
  { key: "blue", label: "Blue" },
  { key: "rose", label: "Rose" },
  { key: "orange", label: "Orange" },
  { key: "purple", label: "Purple" },
  { key: "gray", label: "Gray" },
]

export interface CalloutPickerInfo {
  anchorRect: DOMRect
  activeColor: string
  nodePos: number
  view: EditorView
}

// Walk MDAST tree in reverse order so splices don't break indices
function walk(node: any, fn: (node: any, idx: number, parent: any) => void) {
  if (node.children) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      fn(node.children[i], i, node)
      walk(node.children[i], fn)
    }
  }
}

function remarkCalloutPlugin(this: any) {
  const data = this.data() as any
  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = []
  data.toMarkdownExtensions.push({
    handlers: {
      callout(node: any, parent: any, state: any, info: any) {
        const color = node.data?.color ?? "yellow"
        const blockquote = {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: `[callout:${color}]` }],
            },
            ...(node.children ?? []),
          ],
        }
        return state.one(blockquote, parent, info)
      },
    },
  })

  return (tree: any) => {
    walk(tree, (node: any, index: number, parent: any) => {
      if (node.type !== "blockquote" || !parent) return
      const firstChild = node.children?.[0]
      if (!firstChild || firstChild.type !== "paragraph") return
      const firstText = firstChild.children?.[0]
      if (!firstText || firstText.type !== "text") return
      const match = /^\[callout:([a-z]+)\]$/.exec(firstText.value)
      if (!match) return
      const color = match[1]
      parent.children.splice(index, 1, {
        type: "callout",
        data: { color },
        children: node.children.slice(1),
      })
    })
  }
}

export const calloutNode = $node("callout", () => ({
  content: "block+",
  group: "block",
  defining: true,
  attrs: { color: { default: "yellow" } },
  parseDOM: [
    {
      tag: "div[data-callout]",
      getAttrs: (dom: HTMLElement | string) => {
        if (typeof dom === "string") return false
        return { color: (dom as HTMLElement).getAttribute("data-callout-color") ?? "yellow" }
      },
    },
  ],
  toDOM: (node: import("@milkdown/prose/model").Node) => [
    "div",
    { "data-callout": "", "data-callout-color": node.attrs.color },
    0,
  ],
  parseMarkdown: {
    match: (n: any) => n.type === "callout",
    runner: (state: any, n: any, type: import("@milkdown/prose/model").NodeType) => {
      state.openNode(type, { color: n.data?.color ?? "yellow" })
      state.next(n.children)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (n: import("@milkdown/prose/model").Node) => n.type.name === "callout",
    runner: (state: any, n: import("@milkdown/prose/model").Node) => {
      state.openNode("callout", undefined, { color: n.attrs.color })
      state.next(n.content)
      state.closeNode()
    },
  },
}))

export function createCalloutPlugins(opts: {
  onPickerRef: React.MutableRefObject<(info: CalloutPickerInfo | null) => void>
}) {
  const { onPickerRef } = opts

  const remarkPlugins = $remark("callout", () => remarkCalloutPlugin)

  const viewPlugin = $view(calloutNode, (_ctx) => (initialNode, view, getPos) => {
    let currentNode = initialNode

    const dom = document.createElement("div")
    dom.className = "callout"
    dom.setAttribute("data-callout-color", currentNode.attrs.color)
    dom.style.setProperty("--callout-bg", `var(--callout-${currentNode.attrs.color})`)
    dom.style.setProperty("--callout-accent", `var(--callout-${currentNode.attrs.color}-accent)`)

    const strip = document.createElement("button")
    strip.className = "callout-color-strip"
    strip.contentEditable = "false"
    strip.setAttribute("aria-label", "Change callout color")
    strip.setAttribute("type", "button")

    const content = document.createElement("div")
    content.className = "callout-content"

    dom.appendChild(strip)
    dom.appendChild(content)

    strip.addEventListener("mousedown", (e) => {
      e.preventDefault()
      const pos = typeof getPos === "function" ? getPos() : undefined
      if (pos === undefined) return
      onPickerRef.current({
        anchorRect: strip.getBoundingClientRect(),
        activeColor: currentNode.attrs.color,
        nodePos: pos,
        view,
      })
    })

    return {
      dom,
      contentDOM: content,
      update(newNode) {
        if (newNode.type !== currentNode.type) return false
        currentNode = newNode
        dom.setAttribute("data-callout-color", newNode.attrs.color)
        dom.style.setProperty("--callout-bg", `var(--callout-${newNode.attrs.color})`)
        dom.style.setProperty("--callout-accent", `var(--callout-${newNode.attrs.color}-accent)`)
        return true
      },
    }
  })

  return [...remarkPlugins, calloutNode, viewPlugin] as const
}
