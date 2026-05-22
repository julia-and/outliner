import * as Y from "yjs"
import { NodeYRecord, NodeStyle } from "./types"
import { getNodesMap } from "./nodeOps"

function mergeStyle(
  current: NodeStyle | undefined,
  patch: Partial<NodeStyle>,
): NodeStyle {
  const merged = { ...(current ?? {}), ...patch }
  for (const k of Object.keys(merged)) {
    if ((merged as Record<string, unknown>)[k] === undefined) {
      delete (merged as Record<string, unknown>)[k]
    }
  }
  return merged
}

export function updateStyle(
  doc: Y.Doc,
  id: string,
  style: Partial<NodeStyle>,
): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(id)
  if (!node) return
  nodesMap.set(id, {
    ...node,
    style: mergeStyle(node.style, style),
    modifiedAt: Date.now(),
  })
}

export function updateStyleRecursive(
  doc: Y.Doc,
  id: string,
  style: Partial<NodeStyle>,
): void {
  const nodesMap = getNodesMap(doc)
  const childMap = new Map<string | null, string[]>()
  for (const [nid, n] of nodesMap.entries()) {
    const list = childMap.get(n.parentId) ?? []
    list.push(nid)
    childMap.set(n.parentId, list)
  }
  const now = Date.now()
  doc.transact(() => {
    const apply = (nodeId: string) => {
      const node: NodeYRecord | undefined = nodesMap.get(nodeId)
      if (!node) return
      nodesMap.set(nodeId, {
        ...node,
        style: mergeStyle(node.style, style),
        modifiedAt: now,
      })
      const children = childMap.get(nodeId) ?? []
      for (const childId of children) apply(childId)
    }
    apply(id)
  })
}
