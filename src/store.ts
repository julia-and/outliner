import * as Y from "yjs"
import Dexie, { Table } from "dexie"
import { NodeData, OutletNode, NodeStyle } from "./types"

// --- Persistence ---
class OutlineDB extends Dexie {
  docs!: Table<{ id: string; update: Uint8Array }, string>
  constructor() {
    super("OutlineDB")
    this.version(1).stores({ docs: "id" })
  }
}
const db = new OutlineDB()
const DOC_ID = "main-doc"

// --- Yjs Data ---
export const yDoc = new Y.Doc()
export const yNodes = yDoc.getMap<Y.Map<any>>("nodes")

// Debounced Auto-save
let saveTimeout: any
yDoc.on("update", () => {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    const update = Y.encodeStateAsUpdate(yDoc)
    await db.docs.put({ id: DOC_ID, update })
  }, 500)
})

// Initialization
export async function initStore() {
  const persisted = await db.docs.get(DOC_ID)
  if (persisted) Y.applyUpdate(yDoc, persisted.update)
  if (yNodes.size === 0)
    createNode(null, 0, crypto.randomUUID(), "Welcome to Outline")
}

// --- Mutations ---
export function createNode(
  parentId: string | null,
  index = 0,
  id?: string,
  title = "",
): string {
  const newId = id || crypto.randomUUID()
  const yNode = new Y.Map()
  yNode.set("id", newId)
  yNode.set("parentId", parentId)
  yNode.set("title", title)
  yNode.set("collapsed", false)
  yNode.set("children", new Y.Array())
  yNode.set("style", {})
  yNode.set("data", {})

  yDoc.transact(() => {
    yNodes.set(newId, yNode)
    if (parentId) {
      const p = yNodes.get(parentId)
      if (p) (p.get("children") as Y.Array<string>).insert(index, [newId])
    } else {
      const rootList = yDoc.getArray<string>("root-children")
      if (index >= 0 && index <= rootList.length)
        rootList.insert(index, [newId])
      else rootList.push([newId])
    }
  })
  return newId
}

export function updateTitle(id: string, text: string, origin: any = null) {
  yDoc.transact(() => {
    yNodes.get(id)?.set("title", text)
  }, origin)
}

export function updateStyle(id: string, style: Partial<NodeStyle>) {
  yDoc.transact(() => {
    const node = yNodes.get(id)
    if (node) {
      const currentStyle = node.get("style") || {}
      node.set("style", { ...currentStyle, ...style })
    }
  })
}

export function toggleCollapse(id: string) {
  const n = yNodes.get(id)
  if (n) n.set("collapsed", !n.get("collapsed"))
}

export function deleteNode(id: string) {
  yDoc.transact(() => {
    const n = yNodes.get(id)
    if (!n) return
    const parentId = n.get("parentId")

    // Remove from parent list
    let list: Y.Array<string>
    if (parentId)
      list = yNodes.get(parentId)?.get("children") as Y.Array<string>
    else list = yDoc.getArray<string>("root-children")

    const idx = list.toArray().indexOf(id)
    if (idx > -1) list.delete(idx, 1)

    // Recursive cleanup could go here
    yNodes.delete(id)
  })
}

// --- Positioning Logic ---
export function addSibling(refId: string): string {
  const n = yNodes.get(refId)
  if (!n) return createNode(null)
  const parentId = n.get("parentId")

  // Find index
  let list = parentId
    ? (yNodes.get(parentId)?.get("children") as Y.Array<string>)
    : yDoc.getArray<string>("root-children")
  const idx = list.toArray().indexOf(refId)
  return createNode(parentId, idx + 1)
}

export function addRootSibling(refId: string): string {
  let currentId = refId
  let n = yNodes.get(currentId)
  while (n && n.get("parentId")) {
    currentId = n.get("parentId")
    n = yNodes.get(currentId)
  }

  const rootList = yDoc.getArray<string>("root-children")
  const idx = rootList.toArray().indexOf(currentId)
  return createNode(null, idx + 1)
}

export function addChild(parentId: string): string {
  const p = yNodes.get(parentId)
  if (p) p.set("collapsed", false)
  return createNode(parentId, 0)
}

// --- Flattening (Tree -> List) ---
export function flattenNodes(): OutletNode[] {
  const result: OutletNode[] = []
  const rootIds = yDoc.getArray<string>("root-children").toArray()

  const traverse = (ids: string[], depth: number) => {
    for (const id of ids) {
      const n = yNodes.get(id)
      if (!n) continue
      const data = n.toJSON() as NodeData
      const hasChildren = data.children.length > 0

      result.push({
        id,
        title: data.title,
        depth,
        style: data.style || {},
        collapsed: data.collapsed,
        hasChildren,
      })

      if (hasChildren && !data.collapsed) {
        traverse(data.children, depth + 1)
      }
    }
  }
  traverse(rootIds, 0)
  return result
}

// --- Movement Logic ---

export function moveNode(id: string, direction: "up" | "down") {
  yDoc.transact(() => {
    const node = yNodes.get(id)
    if (!node) return
    const parentId = node.get("parentId")

    let list: Y.Array<string>
    if (parentId) {
      const p = yNodes.get(parentId)
      if (!p) return
      list = p.get("children") as Y.Array<string>
    } else {
      list = yDoc.getArray<string>("root-children")
    }

    const currentIdx = list.toArray().indexOf(id)
    if (currentIdx === -1) return

    const newIdx = direction === "up" ? currentIdx - 1 : currentIdx + 1

    // Bounds check
    if (newIdx >= 0 && newIdx < list.length) {
      list.delete(currentIdx, 1)
      list.insert(newIdx, [id])
    }
  })
}

export function indentNode(id: string) {
  yDoc.transact(() => {
    const node = yNodes.get(id)
    if (!node) return
    const parentId = node.get("parentId")

    let siblings: Y.Array<string>
    if (parentId) {
      siblings = yNodes.get(parentId)!.get("children") as Y.Array<string>
    } else {
      siblings = yDoc.getArray<string>("root-children")
    }

    const idx = siblings.toArray().indexOf(id)
    // Cannot indent if first child
    if (idx <= 0) return

    const prevSiblingId = siblings.get(idx - 1)
    const prevSibling = yNodes.get(prevSiblingId)
    if (!prevSibling) return

    // Move
    siblings.delete(idx, 1)
    const newParentList = prevSibling.get("children") as Y.Array<string>
    newParentList.push([id])

    node.set("parentId", prevSiblingId)
    prevSibling.set("collapsed", false) // Expand new parent
  })
}

export function outdentNode(id: string) {
  yDoc.transact(() => {
    const node = yNodes.get(id)
    if (!node) return
    const parentId = node.get("parentId")

    // Cannot outdent if root
    if (!parentId) return

    const parentNode = yNodes.get(parentId)
    if (!parentNode) return

    const grandParentId = parentNode.get("parentId")

    // Remove from current parent
    const currentList = parentNode.get("children") as Y.Array<string>
    const idx = currentList.toArray().indexOf(id)
    if (idx > -1) currentList.delete(idx, 1)

    // Add to grandparent (next to parent)
    let targetList: Y.Array<string>
    if (grandParentId) {
      targetList = yNodes.get(grandParentId)!.get("children") as Y.Array<string>
    } else {
      targetList = yDoc.getArray<string>("root-children")
    }

    // Find index of parent to insert after
    const parentIdx = targetList.toArray().indexOf(parentId)
    targetList.insert(parentIdx + 1, [id])

    node.set("parentId", grandParentId)
  })
}
