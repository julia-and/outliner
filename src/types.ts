export interface NodeStyle {
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  color?: string
  backgroundColor?: string
}

export interface NodeData {
  id: string
  parentId: string | null
  title: string
  collapsed: boolean
  children: string[] // Order of child IDs
  style: NodeStyle
  data: Record<string, any> // For future custom columns
}

export interface OutletNode {
  id: string
  title: string
  depth: number
  style: NodeStyle // Flattened style for CSS
  collapsed: boolean
  hasChildren: boolean
}
