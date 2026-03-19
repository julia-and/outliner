import * as Y from "yjs"
import Dexie, { EntityTable, Table } from "dexie"
import dexieCloud from "dexie-cloud-addon"
import yDexie from "y-dexie"
import { NodeYRecord, NodeStyle, OutlineRow } from "./types"
import type { ClipboardPayload, ClipboardNode } from "./utils/clipboard"

export interface TemplateRow {
  id: string
  name: string
  content: string
  createdAt: number
}

if (import.meta.env.VITE_DEXIE_DEBUG) Dexie.debug = true

// --- Schema ---

interface UiStateRow {
  id: string
  panelLayout?: { [id: string]: number }
  layoutDirection: "horizontal" | "vertical"
  darkMode: boolean
  activeOutlineId?: string
  activeNodeId?: string
}

interface NodeContentsRow {
  nodeId: string
  content: Y.Doc
}

interface ImageRow {
  id: string
  blob: Blob
  mimeType: string
  size: number
  createdAt: number
}

class OutlineDB extends Dexie {
  outlines!: EntityTable<OutlineRow, "id">
  nodeContents!: Table<NodeContentsRow, string>
  uiState!: Table<UiStateRow, string>
  images!: Table<ImageRow, string>
  templates!: EntityTable<TemplateRow, "id">

  constructor() {
    super("OutlineDB", { addons: [yDexie, dexieCloud] })
    this.version(1).stores({
      outlines: "id, name, createdAt, content: Y.Doc",
      nodeContents: "nodeId, content: Y.Doc",
      uiState: "id",
    })
    this.version(2).stores({
      outlines: "id, name, createdAt, content: Y.Doc",
      nodeContents: "nodeId, content: Y.Doc",
      uiState: "id",
      images: "id, mimeType, size, createdAt",
    })
    this.version(3).stores({
      outlines: "id, name, createdAt, content: Y.Doc",
      nodeContents: "nodeId, content: Y.Doc",
      uiState: "id",
      images: "id, mimeType, size, createdAt",
      templates: "id, name, createdAt",
    })
    this.cloud.configure({
      databaseUrl: "https://zw3md6zf8.dexie.cloud",
      unsyncedTables: ["uiState"],
      tryUseServiceWorker: true,
    })
  }
}

export const db = new OutlineDB()

// --- Device ID (per-device, stored in localStorage so uiState doesn't sync across devices) ---

function getDeviceId(): string {
  let id = localStorage.getItem("ol-device-id")
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem("ol-device-id", id)
  }
  return id
}
const DEVICE_ID = getDeviceId()

// --- UI State Cache (synchronous getters) ---

let uiCache: UiStateRow = {
  id: DEVICE_ID,
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

export function getActiveOutlineId(): string | null {
  return uiCache.activeOutlineId ?? null
}

export function getActiveNodeId(): string | null {
  return uiCache.activeNodeId ?? null
}

export function setPanelLayout(layout: { [id: string]: number }) {
  uiCache = { ...uiCache, panelLayout: layout }
  db.uiState.put(uiCache).catch(console.error)
}

export function setLayoutDirection(direction: "horizontal" | "vertical") {
  uiCache = { ...uiCache, layoutDirection: direction }
  db.uiState.put(uiCache).catch(console.error)
}

export function setDarkMode(value: boolean) {
  uiCache = { ...uiCache, darkMode: value }
  db.uiState.put(uiCache).catch(console.error)
}

export function setActiveOutlineId(id: string | null) {
  uiCache = { ...uiCache, activeOutlineId: id ?? undefined }
  db.uiState.put(uiCache).catch(console.error)
}

export function setActiveNodeId(id: string | null) {
  uiCache = { ...uiCache, activeNodeId: id ?? undefined }
  db.uiState.put(uiCache).catch(console.error)
}

// --- Initialization ---

export async function initStore(): Promise<boolean> {
  const ui = await db.uiState.get(DEVICE_ID)
  if (ui) uiCache = ui

  if ((await db.outlines.count()) === 0) {
    await seedStarterTemplates()
    return true  // first run — caller shows welcome screen
  }

  if (!uiCache.activeOutlineId) {
    const first = await db.outlines.orderBy("createdAt").first()
    if (first) setActiveOutlineId(first.id)
  }

  await seedStarterTemplates()
  return false
}

// --- Template seeding ---

const STARTER_TEMPLATES: TemplateRow[] = [
  {
    id: "starter:meeting-notes",
    name: "Meeting Notes",
    content:
      "## Meeting Notes\n\n**Date:** \n**Attendees:** \n\n### Agenda\n\n- \n\n### Discussion\n\n\n\n### Action Items\n\n- [ ] \n",
    createdAt: 0,
  },
  {
    id: "starter:daily-journal",
    name: "Daily Journal",
    content:
      "## Daily Journal\n\n**Date:** \n\n### What I accomplished today\n\n\n\n### What I'm grateful for\n\n\n\n### Goals for tomorrow\n\n- \n",
    createdAt: 0,
  },
  {
    id: "starter:project-spec",
    name: "Project Spec",
    content:
      "## Project Spec\n\n### Overview\n\n\n\n### Goals\n\n- \n\n### Non-goals\n\n- \n\n### Implementation Plan\n\n\n\n### Open Questions\n\n- \n",
    createdAt: 0,
  },
  {
    id: "starter:weekly-review",
    name: "Weekly Review",
    content:
      "## Weekly Review\n\n**Week of:** \n\n### Wins\n\n- \n\n### Challenges\n\n- \n\n### Learnings\n\n\n\n### Focus for next week\n\n- \n",
    createdAt: 0,
  },
]

async function seedStarterTemplates(): Promise<void> {
  await db.templates.bulkPut(STARTER_TEMPLATES)
}

// --- Template CRUD ---

export async function createTemplate(
  name: string,
  content: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await db.templates.add({ id, name, content, createdAt: Date.now() })
  return id
}

export async function updateTemplate(
  id: string,
  patch: Partial<TemplateRow>,
): Promise<void> {
  await db.templates.update(id, patch)
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id)
}

// --- Outline CRUD ---

const justCreatedIds = new Set<string>()

export async function createOutline(name: string): Promise<string> {
  const id = crypto.randomUUID()
  await db.outlines.add({ id, name, createdAt: Date.now() } as any)
  justCreatedIds.add(id)
  return id
}

export function consumeIsJustCreated(id: string): boolean {
  const was = justCreatedIds.has(id)
  justCreatedIds.delete(id)
  return was
}

export async function renameOutline(id: string, name: string): Promise<void> {
  await db.outlines.update(id, { name })
}

export async function deleteOutline(id: string): Promise<void> {
  await db.outlines.delete(id)
}

// --- Node helpers (synchronous, operate on Y.Doc in-memory) ---

export function getNodesMap(doc: Y.Doc): Y.Map<NodeYRecord> {
  return doc.getMap<NodeYRecord>("nodes")
}

function getSortedSiblings(
  nodesMap: Y.Map<NodeYRecord>,
  parentId: string | null,
): [string, NodeYRecord][] {
  return Array.from(nodesMap.entries())
    .filter(([, n]) => n.parentId === parentId)
    .sort(([, a], [, b]) => a.order - b.order)
}

// --- Node mutations (synchronous) ---

export function createNode(
  doc: Y.Doc,
  parentId: string | null,
  title = "",
  id?: string,
  order?: number,
  templateContent?: string,
): string {
  const nodesMap = getNodesMap(doc)
  const newId = id ?? crypto.randomUUID()
  const siblings = getSortedSiblings(nodesMap, parentId)
  const nodeOrder =
    order ??
    (siblings.length > 0 ? siblings[siblings.length - 1][1].order + 1 : 0)
  nodesMap.set(newId, {
    parentId,
    title,
    order: nodeOrder,
    collapsed: false,
    style: {},
    data: {},
  })
  // Ensure nodeContents entry exists for the editor (fire-and-forget)
  db.nodeContents.put({ nodeId: newId } as any).catch(console.error)
  if (templateContent) pendingNodeContent.set(newId, templateContent)
  return newId
}

// Pending template content for newly created nodes.
// Consumed exactly once by the Editor component when it mounts for that nodeId.
const pendingNodeContent = new Map<string, string>()

export function consumePendingNodeContent(nodeId: string): string | undefined {
  const content = pendingNodeContent.get(nodeId)
  pendingNodeContent.delete(nodeId)
  return content
}

export function deleteNode(doc: Y.Doc, id: string): void {
  const nodesMap = getNodesMap(doc)
  doc.transact(() => {
    Array.from(nodesMap.entries())
      .filter(([, n]) => n.parentId === id)
      .forEach(([childId]) => deleteNode(doc, childId))
    nodesMap.delete(id)
  })
  // Note: nodeContents entry intentionally NOT deleted — supports undo restoration
}

export function addSibling(doc: Y.Doc, refId: string): string {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(refId)
  if (!node) return createNode(doc, null)
  const siblings = getSortedSiblings(nodesMap, node.parentId)
  const idx = siblings.findIndex(([id]) => id === refId)
  const prev = siblings[idx]
  const next = siblings[idx + 1]
  const order = next ? (prev[1].order + next[1].order) / 2 : prev[1].order + 1
  return createNode(doc, node.parentId, "", undefined, order)
}

export function addChild(
  doc: Y.Doc,
  parentId: string,
  templateContent?: string,
): string {
  const nodesMap = getNodesMap(doc)
  const parent = nodesMap.get(parentId)
  if (parent) nodesMap.set(parentId, { ...parent, collapsed: false })
  return createNode(doc, parentId, "", undefined, undefined, templateContent)
}

export function setDefaultChildTemplate(
  doc: Y.Doc,
  nodeId: string,
  templateId: string | null,
): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(nodeId)
  if (!node) return
  const data = { ...(node.data ?? {}) }
  if (templateId === null) {
    delete data.defaultChildTemplateId
  } else {
    data.defaultChildTemplateId = templateId
  }
  nodesMap.set(nodeId, { ...node, data })
}

export function addRootSibling(doc: Y.Doc, refId: string): string {
  const nodesMap = getNodesMap(doc)
  let node = nodesMap.get(refId)
  let nodeId = refId
  while (node?.parentId) {
    nodeId = node.parentId
    node = nodesMap.get(nodeId)
  }
  if (!node) return createNode(doc, null)
  const roots = getSortedSiblings(nodesMap, null)
  const idx = roots.findIndex(([id]) => id === nodeId)
  const next = roots[idx + 1]
  const order = next ? (node.order + next[1].order) / 2 : node.order + 1
  return createNode(doc, null, "", undefined, order)
}

export function moveNode(
  doc: Y.Doc,
  id: string,
  direction: "up" | "down",
): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(id)
  if (!node) return
  const siblings = getSortedSiblings(nodesMap, node.parentId)
  const idx = siblings.findIndex(([sid]) => sid === id)
  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= siblings.length) return
  const [otherId, other] = siblings[swapIdx]
  doc.transact(() => {
    nodesMap.set(id, { ...node, order: other.order })
    nodesMap.set(otherId, { ...other, order: node.order })
  })
}

export function indentNode(doc: Y.Doc, id: string): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(id)
  if (!node) return
  const siblings = getSortedSiblings(nodesMap, node.parentId)
  const idx = siblings.findIndex(([sid]) => sid === id)
  if (idx <= 0) return
  const [newParentId, newParent] = siblings[idx - 1]
  const newParentChildren = getSortedSiblings(nodesMap, newParentId)
  const order =
    newParentChildren.length > 0
      ? newParentChildren[newParentChildren.length - 1][1].order + 1
      : 0
  doc.transact(() => {
    nodesMap.set(id, { ...node, parentId: newParentId, order })
    nodesMap.set(newParentId, { ...newParent, collapsed: false })
  })
}

export function outdentNode(doc: Y.Doc, id: string): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(id)
  if (!node?.parentId) return
  const parent = nodesMap.get(node.parentId)
  if (!parent) return
  const grandParentSiblings = getSortedSiblings(nodesMap, parent.parentId)
  const parentIdx = grandParentSiblings.findIndex(
    ([sid]) => sid === node.parentId,
  )
  const next = grandParentSiblings[parentIdx + 1]
  const order = next ? (parent.order + next[1].order) / 2 : parent.order + 1
  nodesMap.set(id, { ...node, parentId: parent.parentId, order })
}

export function updateTitle(doc: Y.Doc, id: string, title: string): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(id)
  if (node) nodesMap.set(id, { ...node, title })
}

export function updateStyle(
  doc: Y.Doc,
  id: string,
  style: Partial<NodeStyle>,
): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(id)
  if (!node) return
  const merged = { ...(node.style ?? {}), ...style }
  Object.keys(merged).forEach((k) => {
    if ((merged as Record<string, unknown>)[k] === undefined)
      delete (merged as Record<string, unknown>)[k]
  })
  nodesMap.set(id, { ...node, style: merged })
}

export function toggleCollapse(doc: Y.Doc, id: string): void {
  const nodesMap = getNodesMap(doc)
  const node = nodesMap.get(id)
  if (node) nodesMap.set(id, { ...node, collapsed: !node.collapsed })
}

export function moveNodeBefore(doc: Y.Doc, id: string, targetId: string): void {
  const nodesMap = getNodesMap(doc)
  const target = nodesMap.get(targetId)
  if (!target) return
  const siblings = getSortedSiblings(nodesMap, target.parentId)
  const filtered = siblings.filter(([sid]) => sid !== id)
  const idx = filtered.findIndex(([sid]) => sid === targetId)
  const prev = filtered[idx - 1]
  const order = prev ? (prev[1].order + target.order) / 2 : target.order - 1
  const node = nodesMap.get(id)
  if (node) nodesMap.set(id, { ...node, parentId: target.parentId, order })
}

export function moveNodeAfter(doc: Y.Doc, id: string, targetId: string): void {
  const nodesMap = getNodesMap(doc)
  const target = nodesMap.get(targetId)
  if (!target) return
  const siblings = getSortedSiblings(nodesMap, target.parentId)
  const filtered = siblings.filter(([sid]) => sid !== id)
  const idx = filtered.findIndex(([sid]) => sid === targetId)
  const next = filtered[idx + 1]
  const order = next ? (target.order + next[1].order) / 2 : target.order + 1
  const node = nodesMap.get(id)
  if (node) nodesMap.set(id, { ...node, parentId: target.parentId, order })
}

export function moveNodeAsLastChild(
  doc: Y.Doc,
  id: string,
  targetParentId: string,
): void {
  const nodesMap = getNodesMap(doc)
  const children = getSortedSiblings(nodesMap, targetParentId)
  const filtered = children.filter(([cid]) => cid !== id)
  const order =
    filtered.length > 0 ? filtered[filtered.length - 1][1].order + 1 : 0
  const node = nodesMap.get(id)
  if (node) nodesMap.set(id, { ...node, parentId: targetParentId, order })
}

export function pasteSubtree(
  doc: Y.Doc,
  payload: ClipboardPayload,
  parentId: string | null,
  afterNodeId: string,
): string[] {
  if (payload.nodes.length === 0) return []
  const nodesMap = getNodesMap(doc)
  const afterNode = nodesMap.get(afterNodeId)
  if (!afterNode) return []

  const siblings = getSortedSiblings(nodesMap, parentId)
  const afterIdx = siblings.findIndex(([id]) => id === afterNodeId)
  const nextSibling = siblings[afterIdx + 1]
  const N = payload.nodes.length
  const rootIds: string[] = []

  const insertNode = (
    node: ClipboardNode,
    nodeParentId: string | null,
    order: number | undefined,
  ): void => {
    const newId = createNode(doc, nodeParentId, node.title, undefined, order)
    if (Object.keys(node.style).length > 0) {
      const n = nodesMap.get(newId)
      if (n) nodesMap.set(newId, { ...n, style: node.style })
    }
    if (nodeParentId === parentId) rootIds.push(newId)
    for (const child of node.children) {
      insertNode(child, newId, undefined)
    }
  }

  doc.transact(() => {
    if (nextSibling) {
      const gap = nextSibling[1].order - afterNode.order
      const step = gap / (N + 1)
      for (let i = 0; i < N; i++) {
        insertNode(payload.nodes[i], parentId, afterNode.order + step * (i + 1))
      }
    } else {
      for (let i = 0; i < N; i++) {
        insertNode(payload.nodes[i], parentId, afterNode.order + (i + 1))
      }
    }
  })

  return rootIds
}

export function getAncestors(
  nodesMap: Y.Map<NodeYRecord>,
  id: string,
): { id: string; title: string }[] {
  const result: { id: string; title: string }[] = []
  let currentId = id
  while (true) {
    const node = nodesMap.get(currentId)
    if (!node?.parentId) break
    const parent = nodesMap.get(node.parentId)
    if (!parent) break
    result.unshift({ id: node.parentId, title: parent.title })
    currentId = node.parentId
  }
  return result
}
