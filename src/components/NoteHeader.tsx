import { useState } from "react"
import { OutletNode, NodeStyle } from "../types"
import { NodeIcon } from "./NodeIcon"
import { IconPickerPanel } from "./IconPickerPanel"
import { Popover } from "./Popover"
import styles from "./NoteHeader.module.css"

interface NoteHeaderProps {
  node: OutletNode
  onUpdateTitle: (id: string, title: string) => void
  onUpdateStyle: (id: string, style: Partial<NodeStyle>) => void
  syncStyle?: boolean
}

export const NoteHeader = ({
  node,
  onUpdateTitle,
  onUpdateStyle,
  syncStyle = true,
}: NoteHeaderProps) => {
  const [pickerOpen, setPickerOpen] = useState(false)
  const s = node.style

  const containerStyle = syncStyle ? {
    color: s.color,
    backgroundColor: s.backgroundColor,
  } : undefined

  const titleStyle = syncStyle ? {
    fontWeight: s.bold ? 700 : undefined,
    fontStyle: s.italic ? "italic" : undefined,
    textDecoration: s.strikethrough ? "line-through" : undefined,
  } : undefined

  return (
    <div className={styles.header} style={containerStyle}>
      <Popover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        placement="bottom-start"
        trigger={
          <button
            className={styles.iconBtn}
            title="Change icon"
            style={s.icon ? { color: s.iconColor ?? "var(--text-secondary)" } : undefined}
          >
            {s.icon ? (
              <NodeIcon name={s.icon} size={28} />
            ) : (
              <span className={styles.iconPlaceholder} />
            )}
          </button>
        }
      >
        <IconPickerPanel
          nodeStyle={s}
          onSelectIcon={(name) => {
            onUpdateStyle(node.id, { icon: name })
          }}
          onRemoveIcon={() => {
            onUpdateStyle(node.id, { icon: undefined, iconColor: undefined })
            setPickerOpen(false)
          }}
          onSelectColor={(color) => {
            onUpdateStyle(node.id, { iconColor: color })
          }}
        />
      </Popover>

      <input
        className={styles.titleInput}
        style={titleStyle}
        value={node.title}
        onChange={(e) => onUpdateTitle(node.id, e.target.value)}
        placeholder="Untitled"
      />
    </div>
  )
}
