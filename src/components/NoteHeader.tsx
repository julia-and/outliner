import React, { useState } from "react"
import { OutletNode } from "../types"
import { updateStyle } from "../store"
import { ICON_MAP } from "../utils/iconMap"
import { IconPickerPanel } from "./IconPickerPanel"
import { Popover } from "./Popover"
import styles from "./NoteHeader.module.css"

interface NoteHeaderProps {
  node: OutletNode
  onUpdateTitle: (id: string, title: string) => void
}

export const NoteHeader: React.FC<NoteHeaderProps> = ({
  node,
  onUpdateTitle,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false)
  const s = node.style
  const IconComponent = s.icon ? ICON_MAP[s.icon] : null

  return (
    <div className={styles.header}>
      <Popover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        placement="bottom-start"
        trigger={
          <button
            className={styles.iconBtn}
            title="Change icon"
            style={IconComponent ? { color: s.iconColor ?? "var(--text-secondary)" } : undefined}
          >
            {IconComponent ? (
              <IconComponent size={28} />
            ) : (
              <span className={styles.iconPlaceholder} />
            )}
          </button>
        }
      >
        <IconPickerPanel
          nodeStyle={s}
          onSelectIcon={(name) => {
            updateStyle(node.id, { icon: name })
          }}
          onRemoveIcon={() => {
            updateStyle(node.id, { icon: undefined, iconColor: undefined })
            setPickerOpen(false)
          }}
          onSelectColor={(color) => {
            updateStyle(node.id, { iconColor: color })
          }}
        />
      </Popover>

      <input
        className={styles.titleInput}
        value={node.title}
        onChange={(e) => onUpdateTitle(node.id, e.target.value)}
        placeholder="Untitled"
      />
    </div>
  )
}
