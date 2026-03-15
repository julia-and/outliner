import React from "react"
import classNames from "classnames"
import { NodeStyle } from "../types"
import { ICON_NAMES, ICON_MAP } from "../utils/iconMap"
import styles from "./IconPickerPanel.module.css"

const COLOR_PALETTE = [
  "#ffffff",
  "#9b9b9b",
  "#000000",
  "#d1335b",
  "#e54d2e",
  "#f76808",
  "#ffca16",
  "#4a9256",
  "#2563eb",
  "#7c3aed",
]

interface IconPickerPanelProps {
  nodeStyle: NodeStyle
  onSelectIcon: (name: string) => void
  onRemoveIcon: () => void
  onSelectColor: (color: string) => void
}

export const IconPickerPanel: React.FC<IconPickerPanelProps> = ({
  nodeStyle,
  onSelectIcon,
  onRemoveIcon,
  onSelectColor,
}) => {
  return (
    <div className={styles.panel}>
      <div className={styles.iconGrid}>
        {ICON_NAMES.map((name) => {
          const Icon = ICON_MAP[name]
          return (
            <button
              key={name}
              className={classNames(styles.iconBtn, {
                [styles.selected]: nodeStyle.icon === name,
              })}
              onClick={() => onSelectIcon(name)}
              title={name}
            >
              <Icon size={16} />
            </button>
          )
        })}
      </div>
      <div className={styles.divider} />
      <div className={styles.colorRow}>
        {COLOR_PALETTE.map((color) => (
          <button
            key={color}
            className={classNames(styles.swatch, {
              [styles.swatchSelected]: nodeStyle.iconColor === color,
            })}
            style={{ background: color }}
            onClick={() => onSelectColor(color)}
            title={color}
          />
        ))}
      </div>
      <div className={styles.divider} />
      <button className={styles.removeBtn} onClick={onRemoveIcon}>
        REMOVE ICON
      </button>
    </div>
  )
}
