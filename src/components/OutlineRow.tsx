import React, { useEffect, useRef } from "react"
import classNames from "classnames"
import { OutletNode } from "../types"
import { ICON_MAP } from "../utils/iconMap"
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
}

export const OutlineRow: React.FC<OutlineRowProps> = ({
  node,
  isActive,
  mode,
  onRowClick,
  onRowDblClick,
  onRowContextMenu,
  onUpdateTitle,
  onBulletClick,
}) => {
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
  const IconComponent = s.icon ? ICON_MAP[s.icon] : null

  const rowStyle: React.CSSProperties = {
    fontWeight: s.bold ? 700 : undefined,
    fontStyle: s.italic ? "italic" : undefined,
    color: s.color,
    backgroundColor: s.backgroundColor,
  }

  return (
    <div
      className={classNames(styles.row, { [styles.active]: isActive })}
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
          className={classNames(styles.bullet, {
            [styles.hasChildren]: node.hasChildren && !IconComponent,
            [styles.bulletIcon]: !!IconComponent,
          })}
          onClick={(e) => {
            e.stopPropagation()
            onBulletClick(node.id, e.currentTarget)
          }}
          tabIndex={-1}
          style={
            IconComponent
              ? { color: s.iconColor ?? "var(--text-secondary)" }
              : undefined
          }
        >
          {IconComponent && <IconComponent size={14} />}
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
    </div>
  )
}
