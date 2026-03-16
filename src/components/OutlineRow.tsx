import React, { useEffect, useRef } from "react"
import classNames from "classnames"
import { ChevronRight, ChevronDown, GripVertical } from "lucide-react"
import { OutletNode } from "../types"
import { NodeIcon } from "./NodeIcon"
import styles from "./OutlineRow.module.css"

interface OutlineRowProps {
  node: OutletNode
  isActive: boolean
  mode: "nav" | "insert"
  onRowClick: (id: string) => void
  onRowDblClick: (id: string) => void
  onRowContextMenu: (id: string, x: number, y: number) => void
  onUpdateTitle: (id: string, title: string) => void
  onBulletClick: (id: string, element: HTMLElement) => void
  onToggleCollapse: (id: string) => void
  onDragHandlePointerDown: (id: string, e: React.PointerEvent) => void
  isDragging?: boolean
}

export const OutlineRow = ({
  node,
  isActive,
  mode,
  onRowClick,
  onRowDblClick,
  onRowContextMenu,
  onUpdateTitle,
  onBulletClick,
  onToggleCollapse,
  onDragHandlePointerDown,
  isDragging,
}: OutlineRowProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isActive && mode === "insert" && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isActive, mode])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onRowContextMenu(node.id, e.clientX, e.clientY)
  }

  const s = node.style

  const rowStyle: React.CSSProperties = {
    fontWeight: s.bold ? 700 : undefined,
    fontStyle: s.italic ? "italic" : undefined,
    color: s.color,
    backgroundColor: s.backgroundColor,
  }

  return (
    <div
      className={classNames(styles.row, {
        [styles.active]: isActive,
        [styles.dragging]: isDragging,
      })}
      style={rowStyle}
      onClick={() => onRowClick(node.id)}
      onDoubleClick={() => onRowDblClick(node.id)}
      onContextMenu={handleContextMenu}
    >
      <div
        className={styles.mainColumn}
        style={{ paddingLeft: `${node.depth * 16}px` }}
      >
        <button
          className={classNames(styles.caret, {
            [styles.caretVisible]: node.hasChildren,
          })}
          onClick={(e) => {
            e.stopPropagation()
            if (node.hasChildren) onToggleCollapse(node.id)
          }}
          tabIndex={-1}
        >
          {node.hasChildren && (
            node.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />
          )}
        </button>
        <button
          className={classNames(styles.bullet, {
            [styles.hasChildren]: node.hasChildren && !s.icon,
            [styles.bulletIcon]: !!s.icon,
          })}
          onClick={(e) => {
            e.stopPropagation()
            onBulletClick(node.id, e.currentTarget)
          }}
          tabIndex={-1}
          style={s.icon ? { color: s.iconColor ?? "var(--text-secondary)" } : undefined}
        >
          {s.icon && <NodeIcon name={s.icon} size={14} />}
        </button>
        <input
          className={styles.input}
          style={{ textDecoration: s.strikethrough ? "line-through" : undefined }}
          ref={inputRef}
          value={node.title}
          onChange={(e) => onUpdateTitle(node.id, e.target.value)}
          readOnly={mode !== "insert" || !isActive}
          disabled={mode !== "insert" || !isActive}
        />
      </div>
      <button
        className={styles.dragHandle}
        onPointerDown={(e) => {
          e.stopPropagation()
          onDragHandlePointerDown(node.id, e)
        }}
        tabIndex={-1}
      >
        <GripVertical size={14} />
      </button>
    </div>
  )
}
