import { Trans } from "@lingui/react/macro"
import { t } from "@lingui/core/macro"
import classNames from "classnames"
import { NodeStyle } from "../types"
import { ICON_NAMES } from "../utils/iconMap"
import { colorLabel, COLOR_PALETTE } from "../utils/palette"
import { NodeIcon } from "./NodeIcon"
import styles from "./IconPickerPanel.module.css"

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
  return (
    <div className={styles.panel}>
      <div className={styles.iconGrid}>
        {ICON_NAMES.map((name) => (
          <button
            key={name}
            className={classNames(
              styles.iconBtn,
              nodeStyle.icon === name && styles.selected,
            )}
            onClick={() => onSelectIcon(name)}
            title={name}
          >
            <NodeIcon name={name} size={16} color={nodeStyle.iconColor} />
          </button>
        ))}
      </div>
      <div className={styles.divider} />
      <div className={styles.colorRow}>
        {COLOR_PALETTE.map((color) => (
          <button
            key={color}
            className={classNames(
              styles.swatch,
              nodeStyle.iconColor === color && styles.swatchSelected,
            )}
            style={{ background: color }}
            onClick={() => onSelectColor(color)}
            aria-label={t`Icon color: ${colorLabel(color)}`}
            title={colorLabel(color)}
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
