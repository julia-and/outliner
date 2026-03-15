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

export interface NodeData {
  id: string
  parentId: string | null
  title: string
  order: number
  collapsed: boolean
  style: NodeStyle
  data: Record<string, any>
  content: Y.Doc
}

export interface OutletNode {
  id: string
  title: string
  depth: number
  style: NodeStyle
  collapsed: boolean
  hasChildren: boolean
}
