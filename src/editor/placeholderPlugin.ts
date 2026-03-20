import { $node, $inputRule, $prose, $remark, $view } from "@milkdown/utils"
import { Plugin, PluginKey, NodeSelection, TextSelection } from "@milkdown/prose/state"
import { nodeRule } from "@milkdown/prose"
import type { NodeType } from "@milkdown/prose/model"

// Walk MDAST tree in reverse order so splices don't break indices
function walk(node: any, fn: (node: any, idx: number, parent: any) => void) {
  if (node.children) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      fn(node.children[i], i, node)
      walk(node.children[i], fn)
    }
  }
}

function remarkPlaceholderPlugin(this: any) {
  const data = this.data() as any
  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = []
  data.toMarkdownExtensions.push({
    handlers: {
      placeholder(node: any) {
        return `{{${node.data?.label ?? "Placeholder"}}}`
      },
    },
  })

  return (tree: any) => {
    walk(tree, (node: any, index: number, parent: any) => {
      if (node.type !== "text" || !parent) return
      const re = /\{\{([^}\n]+)\}\}/g
      let match
      const parts: any[] = []
      let lastIndex = 0

      re.lastIndex = 0
      while ((match = re.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) })
        }
        parts.push({
          type: "placeholder",
          data: { label: match[1] },
          children: [],
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

const PLACEHOLDER_KEY = new PluginKey("placeholder")

export const placeholderNode = $node("placeholder", () => ({
  group: "inline",
  inline: true,
  atom: true,
  attrs: { label: { default: "Placeholder" } },
  parseDOM: [
    {
      tag: "span[data-placeholder]",
      getAttrs: (dom: HTMLElement | string) => {
        if (typeof dom === "string") return false
        return { label: (dom as HTMLElement).getAttribute("data-placeholder-label") ?? "Placeholder" }
      },
    },
  ],
  toDOM: (node: import("@milkdown/prose/model").Node) => [
    "span",
    {
      "data-placeholder": "",
      "data-placeholder-label": node.attrs.label,
      class: "placeholder-chip",
    },
    `[${node.attrs.label}]`,
  ],
  parseMarkdown: {
    match: (n: any) => n.type === "placeholder",
    runner: (state: any, n: any, type: NodeType) => {
      state.addNode(type, { label: n.data?.label ?? "Placeholder" })
    },
  },
  toMarkdown: {
    match: (n: import("@milkdown/prose/model").Node) => n.type.name === "placeholder",
    runner: (state: any, n: import("@milkdown/prose/model").Node) => {
      state.addNode("text", undefined, `{{${n.attrs.label || "Placeholder"}}}`)
    },
  },
}))

// Call this after inserting a placeholder via the slash menu to auto-enter edit mode
let pendingEditMode = false
export function schedulePlaceholderEditMode() {
  pendingEditMode = true
}

export function createPlaceholderPlugins() {
  // Tracks whether the currently-selected placeholder is in label-edit mode.
  // In select mode (default): typing replaces the node (ProseMirror default for NodeSelection).
  // In edit mode (Enter to toggle): typing modifies the label character by character.
  let isEditMode = false

  const remarkPlugins = $remark("placeholder", () => remarkPlaceholderPlugin)

  const inputRule = $inputRule((ctx) =>
    nodeRule(/\{\{([^}\n]+)\}\}$/, placeholderNode.type(ctx), {
      getAttr: (match: RegExpMatchArray) => ({ label: match[1] }),
    }),
  )

  const viewPlugin = $view(placeholderNode, (_ctx) => (initialNode, _view, _getPos) => {
    let currentNode = initialNode

    const dom = document.createElement("span")
    dom.className = "placeholder-chip"
    dom.setAttribute("data-placeholder", "")
    updateDisplay()

    function updateDisplay() {
      dom.textContent = `[${currentNode.attrs.label}]`
      dom.setAttribute("data-placeholder-label", currentNode.attrs.label)
    }

    return {
      dom,
      update(newNode) {
        if (newNode.type !== currentNode.type) return false
        currentNode = newNode
        updateDisplay()
        return true
      },
      selectNode() {
        dom.classList.add("ProseMirror-selectednode")
        if (pendingEditMode) {
          isEditMode = true
          pendingEditMode = false
          dom.classList.add("placeholder-editing")
        }
      },
      deselectNode() {
        dom.classList.remove("ProseMirror-selectednode")
        dom.classList.remove("placeholder-editing")
        isEditMode = false
      },
    }
  })

  const keyPlugin = $prose((_ctx) => {
    return new Plugin({
      key: PLACEHOLDER_KEY,
      props: {
        handleKeyDown(view, event) {
          const { state, dispatch } = view
          const { selection, doc } = state

          // Tab / Shift-Tab: navigate between placeholders, entering edit mode at destination
          if (event.key === "Tab") {
            const positions: number[] = []
            doc.descendants((node, pos) => {
              if (node.type.name === "placeholder") positions.push(pos)
            })
            if (positions.length === 0) return false

            const current = selection.from
            let target: number
            if (event.shiftKey) {
              target = positions[positions.length - 1]
              for (let i = positions.length - 1; i >= 0; i--) {
                if (positions[i] < current) { target = positions[i]; break }
              }
            } else {
              target = positions[0]
              for (let i = 0; i < positions.length; i++) {
                if (positions[i] > current) { target = positions[i]; break }
              }
            }
            dispatch(state.tr.setSelection(NodeSelection.create(doc, target)))
            event.preventDefault()
            return true
          }

          if (!(selection instanceof NodeSelection) || selection.node.type.name !== "placeholder") {
            return false
          }

          // Enter: toggle edit mode
          if (event.key === "Enter") {
            if (!isEditMode) {
              isEditMode = true
              const nodeDOM = view.nodeDOM(selection.from)
              if (nodeDOM instanceof HTMLElement) nodeDOM.classList.add("placeholder-editing")
            } else {
              isEditMode = false
              const nodeDOM = view.nodeDOM(selection.from)
              if (nodeDOM instanceof HTMLElement) nodeDOM.classList.remove("placeholder-editing")
              dispatch(state.tr.setSelection(TextSelection.create(doc, selection.to)))
            }
            event.preventDefault()
            return true
          }

          // Escape: exit edit mode (stay selected) or deselect
          if (event.key === "Escape") {
            if (isEditMode) {
              isEditMode = false
              const nodeDOM = view.nodeDOM(selection.from)
              if (nodeDOM instanceof HTMLElement) nodeDOM.classList.remove("placeholder-editing")
            } else {
              dispatch(state.tr.setSelection(TextSelection.create(doc, selection.to)))
            }
            event.preventDefault()
            event.stopPropagation()
            return true
          }

          // In edit mode: intercept character keys and Backspace to edit the label
          if (isEditMode) {
            if (event.key === "Backspace") {
              const label = selection.node.attrs.label
              if (label.length === 0) return false
              const tr = state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, label: label.slice(0, -1) })
              tr.setSelection(NodeSelection.create(tr.doc, selection.from))
              dispatch(tr)
              event.preventDefault()
              return true
            }

            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
              const newLabel = selection.node.attrs.label + event.key
              const tr = state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, label: newLabel })
              tr.setSelection(NodeSelection.create(tr.doc, selection.from))
              dispatch(tr)
              event.preventDefault()
              return true
            }
          }

          // In select mode: let ProseMirror handle typing (replaces the node)
          return false
        },
      },
    })
  })

  return [...remarkPlugins, placeholderNode, viewPlugin, inputRule, keyPlugin] as const
}
