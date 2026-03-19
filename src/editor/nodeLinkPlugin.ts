import React from "react"
import { $node, $view, $prose } from "@milkdown/utils"
import { Plugin, PluginKey } from "@milkdown/prose/state"
import type { EditorView } from "@milkdown/prose/view"
import type { NodeType } from "@milkdown/prose/model"

export interface TriggerInfo {
  query: string
  coords: { left: number; top: number }
  from: number
  to: number
}

interface TriggerState {
  active: boolean
  query: string
  from: number
  suppressed: boolean
}

export const TRIGGER_KEY = new PluginKey<TriggerState>("nodeLinkTrigger")

export function createNodeLinkPlugins(opts: {
  onNavigateRef: React.MutableRefObject<(id: string) => void>
  onTriggerRef: React.MutableRefObject<(info: TriggerInfo | null, view: EditorView) => void>
  onKeyRef: React.MutableRefObject<(key: "ArrowUp" | "ArrowDown" | "Enter" | "Escape") => void>
  nodeLinkTypeRef: React.MutableRefObject<NodeType | null>
}) {
  const { onNavigateRef, onTriggerRef, onKeyRef, nodeLinkTypeRef } = opts

  const nodeLinkNode = $node("node_link", () => ({
    group: "inline",
    inline: true,
    atom: true,
    attrs: {
      nodeId: {},
      label: { default: "" },
    },
    parseDOM: [
      {
        tag: "span[data-node-link]",
        getAttrs: (dom: HTMLElement | string) => {
          if (typeof dom === "string") return false
          return {
            nodeId: dom.getAttribute("data-node-id") ?? "",
            label: dom.textContent ?? "",
          }
        },
      },
    ],
    toDOM: (node: import("@milkdown/prose/model").Node) => [
      "span",
      {
        "data-node-link": "",
        "data-node-id": node.attrs.nodeId,
        class: "node-link-chip",
        contenteditable: "false",
      },
      node.attrs.label || node.attrs.nodeId,
    ],
    parseMarkdown: {
      match: (mdNode: any) =>
        mdNode.type === "link" && typeof mdNode.url === "string" && mdNode.url.startsWith("node://"),
      runner: (state: any, mdNode: any, nodeType: NodeType) => {
        const nodeId = mdNode.url.slice("node://".length)
        const label = mdNode.children?.[0]?.value ?? nodeId
        state.addNode(nodeType, { nodeId, label })
      },
    },
    toMarkdown: {
      match: (node: import("@milkdown/prose/model").Node) => node.type.name === "node_link",
      runner: (state: any, node: import("@milkdown/prose/model").Node) => {
        state.addNode(
          "link",
          [{ type: "text", value: node.attrs.label }],
          undefined,
          { url: `node://${node.attrs.nodeId}`, title: null },
        )
      },
    },
  }))

  const nodeLinkView = $view(nodeLinkNode, (_ctx) => (node, _view, _getPos) => {
    const dom = document.createElement("span")
    dom.className = "node-link-chip"
    dom.textContent = node.attrs.label || node.attrs.nodeId
    dom.contentEditable = "false"
    dom.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      onNavigateRef.current(node.attrs.nodeId)
    })
    return { dom }
  })

  const triggerPlugin = $prose((ctx) => {
    nodeLinkTypeRef.current = nodeLinkNode.type(ctx)
    return new Plugin<TriggerState>({
      key: TRIGGER_KEY,
      state: {
        init: () => ({ active: false, query: "", from: -1, suppressed: false }),
        apply(tr, prev) {
          if (tr.getMeta(TRIGGER_KEY)?.suppress)
            return { ...prev, active: false, suppressed: true }
          const { $from } = tr.selection
          if (!tr.selection.empty || !$from.parent.isTextblock)
            return { active: false, query: "", from: -1, suppressed: false }
          const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
          const match = /\[\[([^\][\n]*)$/.exec(textBefore)
          if (!match)
            return { active: false, query: "", from: -1, suppressed: false }
          const from = $from.pos - match[0].length
          const query = match[1]
          if (prev.suppressed && from === prev.from && query === prev.query)
            return { active: false, query, from, suppressed: true }
          return { active: true, query, from, suppressed: false }
        },
      },
      props: {
        handleKeyDown(view, event) {
          if (!TRIGGER_KEY.getState(view.state)?.active) return false
          const key = event.key
          if (key === "Escape" || key === "ArrowUp" || key === "ArrowDown" || key === "Enter") {
            onKeyRef.current(key as "ArrowUp" | "ArrowDown" | "Enter" | "Escape")
            if (key === "Escape")
              view.dispatch(view.state.tr.setMeta(TRIGGER_KEY, { suppress: true }))
            return true
          }
          return false
        },
      },
      view: () => ({
        update(editorView: EditorView) {
          const state = TRIGGER_KEY.getState(editorView.state)
          if (!state?.active) {
            onTriggerRef.current(null, editorView)
            return
          }
          const coords = editorView.coordsAtPos(state.from)
          onTriggerRef.current(
            {
              query: state.query,
              coords: { left: coords.left, top: coords.bottom + 4 },
              from: state.from,
              to: editorView.state.selection.from,
            },
            editorView,
          )
        },
      }),
    })
  })

  return [nodeLinkNode, nodeLinkView, triggerPlugin] as const
}
