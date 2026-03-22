import { Trans } from "@lingui/react/macro"
import classNames from "classnames"
import { NodeStyle } from "../types"
import { ICON_NAMES } from "../utils/iconMap"
import { COLOR_PALETTE } from "../utils/palette"
import { NodeIcon } from "./NodeIcon"
import styles from "./IconPickerPanel.module.css"
import { useState } from "react"

interface IconPickerPanelProps {
  nodeStyle: NodeStyle
  onSelectIcon: (name: string) => void
  onRemoveIcon: () => void
  onSelectColor: (color: string) => void
}

export const IconPickerPanel = ({
  nodeStyle,
  onSelectIcon,
  onRemoveIcon,
  onSelectColor,
}: IconPickerPanelProps) => {
  const [color, setColor] = useState<string>()
  const onSelectColorWrapper = (newColor: string) => {
    setColor(newColor)
    onSelectColor(newColor)
  }
  return (
    <div className={styles.panel}>
      <div className={styles.iconGrid}>
        {ICON_NAMES.map((name) => (
          <button
            key={name}
            className={classNames(styles.iconBtn, {
              [styles.selected]: nodeStyle.icon === name,
            })}
            onClick={() => onSelectIcon(name)}
            title={name}
          >
            <NodeIcon name={name} size={16} color={color} />
          </button>
        ))}
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
            onClick={() => onSelectColorWrapper(color)}
            title={color}
          />
        ))}
      </div>
      <div className={styles.divider} />
      <button className={styles.removeBtn} onClick={onRemoveIcon}>
        <Trans>REMOVE ICON</Trans>
      </button>
    </div>
  )
}
