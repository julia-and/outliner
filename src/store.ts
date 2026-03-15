import * as Y from "yjs"
import Dexie, { EntityTable, Table } from "dexie"
import dexieCloud from "dexie-cloud-addon"
import yDexie from "y-dexie"
import { NodeData, NodeStyle } from "./types"

// --- Schema ---

interface UiStateRow {
  id: string
  panelLayout?: { [id: string]: number }
  layoutDirection: "horizontal" | "vertical"
  darkMode: boolean
}

class OutlineDB extends Dexie {
  // Legacy tables (kept for migration)
  docs!: Table<{ id: string; update: Uint8Array }, string>
  yjsUpdates!: Table<{ id?: string; docId: string; update: Uint8Array }, string>
  // v3 tables
  nodes!: EntityTable<NodeData, "id">
  uiState!: Table<UiStateRow, string>

  constructor() {
    super("OutlineDB", { addons: [yDexie, dexieCloud] })

    this.version(1).stores({ docs: "id" })

    this.version(2)
      .stores({ docs: null, yjsUpdates: "@id, docId" })
      .upgrade(async (tx) => {
        const old = await tx
          .table<{ id: string; update: Uint8Array }>("docs")
          .get("main-doc")
        if (old) {
          await tx
            .table("yjsUpdates")
            .add({ docId: "main-doc", update: old.update })
        }
      })

    this.version(3).stores({
      nodes: "@id, parentId, order, content: Y.Doc",
      uiState: "id",
    })

    this.cloud.configure({ databaseUrl: "https://zwccz7ne3.dexie.cloud" })
  }
}

export const db = new OutlineDB()

// --- UI State Cache (synchronous getters for SplitLayout) ---

let uiCache: UiStateRow = {
  id: "main",
  layoutDirection: "horizontal",
  darkMode: false,
}

export function getPanelLayout(): { [id: string]: number } | null {
  return uiCache.panelLayout ?? null
}

export function getLayoutDirection(): "horizontal" | "vertical" {
  return uiCache.layoutDirection
}

export function getDarkMode(): boolean {
  return uiCache.darkMode
}

export function setPanelLayout(layout: { [id: string]: number }) {
  uiCache = { ...uiCache, panelLayout: layout }
  db.uiState.put(uiCache)
}

export function setLayoutDirection(direction: "horizontal" | "vertical") {
  uiCache = { ...uiCache, layoutDirection: direction }
  db.uiState.put(uiCache)
}

export function setDarkMode(value: boolean) {
  uiCache = { ...uiCache, darkMode: value }
  db.uiState.put(uiCache)
}

// --- Migration helpers ---

async function migrateFromYjsDoc(oldDoc: Y.Doc) {
  const yNodes = oldDoc.getMap<Y.Map<any>>("nodes")
  const rootIds = oldDoc.getArray<string>("root-children").toArray()
  let order = 0

  const visit = async (ids: string[], parentId: string | null) => {
    for (const id of ids) {
      const n = yNodes.get(id)
      if (!n) continue
      const data = n.toJSON()
      const yText = n.get("content") as Y.Text | undefined
      const nodeDoc = new Y.Doc()
      if (yText && yText.length > 0) {
        nodeDoc.getText().insert(0, yText.toString())
      }
      await db.nodes.add({
        id,
        parentId,
        title: data.title ?? "",
        order: order++,
        collapsed: data.collapsed ?? false,
        style: data.style ?? {},
        data: data.data ?? {},
        content: nodeDoc,
      } as any)
      if (data.children?.length) {
        await visit(data.children, id)
      }
    }
  }
  await visit(rootIds, null)
}

// --- Initialization ---

export async function initStore() {
  const ui = await db.uiState.get("main")
  if (ui) uiCache = ui

  // One-time migration from v2 Yjs data → Dexie rows
  const updateRows = await db.yjsUpdates
    .where("docId")
    .equals("main-doc")
    .toArray()

  if (updateRows.length > 0 && (await db.nodes.count()) === 0) {
    const oldDoc = new Y.Doc()
    for (const row of updateRows) Y.applyUpdate(oldDoc, row.update)
    await migrateFromYjsDoc(oldDoc)

    const oldUi = oldDoc.getMap<any>("ui-state")
    await db.uiState.put({
      id: "main",
      panelLayout: oldUi.get("panelLayout") as { [id: string]: number } | undefined,
      layoutDirection: (oldUi.get("layoutDirection") as "horizontal" | "vertical") ?? "horizontal",
      darkMode: (oldUi.get("darkMode") as boolean) ?? false,
    })
    const saved = await db.uiState.get("main")
    if (saved) uiCache = saved

    await db.yjsUpdates.where("docId").equals("main-doc").delete()
  }

  if ((await db.nodes.count()) === 0) {
    await createNode(null, "Welcome to Outline")
  }
}

// --- Query helpers ---

async function getSortedSiblings(parentId: string | null): Promise<NodeData[]> {
  const all =
    parentId !== null
      ? await db.nodes.where("parentId").equals(parentId).toArray()
      : await db.nodes.filter((n) => n.parentId === null).toArray()
  return all.sort((a, b) => a.order - b.order)
}

// --- Mutations ---

export async function createNode(
  parentId: string | null,
  title = "",
  id?: string,
  order?: number,
): Promise<string> {
  const newId = id ?? crypto.randomUUID()
  let nodeOrder = order
  if (nodeOrder === undefined) {
    const siblings = await getSortedSiblings(parentId)
    nodeOrder =
      siblings.length > 0 ? siblings[siblings.length - 1].order + 1 : 0
  }
  await db.nodes.add({
    id: newId,
    parentId,
    title,
    order: nodeOrder,
    collapsed: false,
    style: {},
    data: {},
  } as any)
  return newId
}

export async function addSibling(refId: string): Promise<string> {
  const node = await db.nodes.get(refId)
  if (!node) return createNode(null)
  const siblings = await getSortedSiblings(node.parentId)
  const idx = siblings.findIndex((s) => s.id === refId)
  const prev = siblings[idx]
  const next = siblings[idx + 1]
  const order = next ? (prev.order + next.order) / 2 : prev.order + 1
  return createNode(node.parentId, "", undefined, order)
}

export async function addChild(parentId: string): Promise<string> {
  await db.nodes.update(parentId, { collapsed: false })
  return createNode(parentId)
}

export async function addRootSibling(refId: string): Promise<string> {
  let node = await db.nodes.get(refId)
  while (node?.parentId) node = await db.nodes.get(node.parentId)
  if (!node) return createNode(null)
  const rootSiblings = await getSortedSiblings(null)
  const idx = rootSiblings.findIndex((s) => s.id === node!.id)
  const next = rootSiblings[idx + 1]
  const order = next ? (node.order + next.order) / 2 : node.order + 1
  return createNode(null, "", undefined, order)
}

export async function moveNode(id: string, direction: "up" | "down") {
  const node = await db.nodes.get(id)
  if (!node) return
  const siblings = await getSortedSiblings(node.parentId)
  const idx = siblings.findIndex((s) => s.id === id)
  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= siblings.length) return
  const other = siblings[swapIdx]
  await db.nodes.update(id, { order: other.order })
  await db.nodes.update(other.id, { order: node.order })
}

export async function indentNode(id: string) {
  const node = await db.nodes.get(id)
  if (!node) return
  const siblings = await getSortedSiblings(node.parentId)
  const idx = siblings.findIndex((s) => s.id === id)
  if (idx <= 0) return
  const newParent = siblings[idx - 1]
  const newParentChildren = await getSortedSiblings(newParent.id)
  const order =
    newParentChildren.length > 0
      ? newParentChildren[newParentChildren.length - 1].order + 1
      : 0
  await db.nodes.update(id, { parentId: newParent.id, order })
  await db.nodes.update(newParent.id, { collapsed: false })
}

export async function outdentNode(id: string) {
  const node = await db.nodes.get(id)
  if (!node?.parentId) return
  const parent = await db.nodes.get(node.parentId)
  if (!parent) return
  const grandParentSiblings = await getSortedSiblings(parent.parentId)
  const parentIdx = grandParentSiblings.findIndex((s) => s.id === parent.id)
  const next = grandParentSiblings[parentIdx + 1]
  const order = next ? (parent.order + next.order) / 2 : parent.order + 1
  await db.nodes.update(id, { parentId: parent.parentId, order })
}

export async function deleteNode(id: string) {
  const children = await db.nodes.where("parentId").equals(id).toArray()
  for (const child of children) await deleteNode(child.id)
  await db.nodes.delete(id)
}

export function updateTitle(id: string, title: string) {
  db.nodes.update(id, { title })
}

export function updateStyle(id: string, style: Partial<NodeStyle>) {
  db.nodes.get(id).then((node) => {
    if (!node) return
    const merged = { ...(node.style || {}), ...style }
    Object.keys(merged).forEach((k) => {
      if ((merged as Record<string, unknown>)[k] === undefined)
        delete (merged as Record<string, unknown>)[k]
    })
    db.nodes.update(id, { style: merged })
  })
}

export function toggleCollapse(id: string) {
  db.nodes.get(id).then((node) => {
    if (node) db.nodes.update(id, { collapsed: !node.collapsed })
  })
}

export function getAncestors(
  nodeMap: Map<string, NodeData>,
  id: string,
): { id: string; title: string }[] {
  const result: { id: string; title: string }[] = []
  let currentId = id
  while (true) {
    const node = nodeMap.get(currentId)
    if (!node?.parentId) break
    const parent = nodeMap.get(node.parentId)
    if (!parent) break
    result.unshift({ id: parent.id, title: parent.title })
    currentId = parent.id
  }
  return result
}
