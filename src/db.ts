import * as Y from "yjs"
import Dexie, { EntityTable, Table } from "dexie"
import dexieCloud from "dexie-cloud-addon"
import yDexie from "y-dexie"
import { OutlineRow } from "./types"

export interface TemplateRow {
  id: string
  name: string
  content: string
  createdAt: number
}

export interface UiStateRow {
  id: string
  panelLayout?: { [id: string]: number }
  layoutDirection: "horizontal" | "vertical"
  darkMode: boolean
  activeOutlineId?: string
  activeNodeId?: string
}

export interface NodeContentsRow {
  nodeId: string
  content: Y.Doc
}

export interface ImageRow {
  id: string
  blob: Blob
  mimeType: string
  size: number
  createdAt: number
}

// y-dexie auto-creates the `content: Y.Doc` column on insert, so it must not
// appear in the insert shape. These types feed Dexie's third TInsertType
// generic on the tables below.
export type OutlineInsert = Omit<OutlineRow, "content">
export type NodeContentsInsert = Omit<NodeContentsRow, "content">

if (import.meta.env.VITE_DEXIE_DEBUG) Dexie.debug = true

class OutlineDB extends Dexie {
  outlines!: EntityTable<OutlineRow, "id", OutlineInsert>
  nodeContents!: Table<NodeContentsRow, string, NodeContentsInsert>
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
      databaseUrl: "https://zgpzaaasb.dexie.cloud",
      unsyncedTables: ["uiState"],
      tryUseServiceWorker: true,
    })
  }
}

export const db = new OutlineDB()
