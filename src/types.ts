import type * as Y from "yjs"

export interface NodeStyle {
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  color?: string
  backgroundColor?: string
  icon?: string
  iconColor?: string
}

// Stored as Y.Map value in the outline Y.Doc
export interface NodeYRecord {
  parentId: string | null
  title: string
  order: number
  collapsed: boolean
  style: NodeStyle
  data: Record<string, any>
}

// View model (flattened, passed to React)
export interface OutletNode {
  id: string
  parentId: string | null
  title: string
  depth: number
  style: NodeStyle
  collapsed: boolean
  hasChildren: boolean
  data: Record<string, any>
}

export interface OutlineRow {
  id: string
  name: string
  createdAt: number
  content: Y.Doc
}
