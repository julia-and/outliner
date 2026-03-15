import classNames from "classnames"
import { NodeStyle } from "../types"
import styles from "./FormatPanel.module.css"

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

const PRESETS: { label: string; color: string; backgroundColor: string }[] = [
  { label: "Green Light", color: "#1a5c2a", backgroundColor: "#d4edda" },
  { label: "Yellow Light", color: "#7d5a00", backgroundColor: "#fff3cd" },
  { label: "Red Light", color: "#7a1020", backgroundColor: "#f8d7da" },
  { label: "Success", color: "#ffffff", backgroundColor: "#4a9256" },
  { label: "Warning", color: "#1a1a1a", backgroundColor: "#ffca16" },
  { label: "Danger!", color: "#ffffff", backgroundColor: "#d1335b" },
  { label: "Soothing", color: "#1a3a5c", backgroundColor: "#e3f2fd" },
  { label: "Royals", color: "#ffffff", backgroundColor: "#7c3aed" },
  { label: "Solar", color: "#1a1a1a", backgroundColor: "#f76808" },
  { label: "Invert", color: "#ffffff", backgroundColor: "#000000" },
  { label: "Console", color: "#4a9256", backgroundColor: "#1a1a1a" },
  { label: "Rusty", color: "#f76808", backgroundColor: "#2a1a0a" },
]

interface FormatPanelProps {
  nodeStyle: NodeStyle
  onToggle: (key: "bold" | "italic" | "strikethrough") => void
  onClearFormat: () => void
  onSetColor: (color: string | undefined) => void
  onSetBackground: (color: string | undefined) => void
  onApplyPreset: (preset: { color: string; backgroundColor: string }) => void
}

export const FormatPanel = ({
  nodeStyle,
  onToggle,
  onClearFormat,
  onSetColor,
  onSetBackground,
  onApplyPreset,
}: FormatPanelProps) => {
  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Text Format</div>
        <div className={styles.formatRow}>
          <button
            className={classNames(styles.formatBtn, {
              [styles.active]: nodeStyle.bold,
            })}
            onClick={() => onToggle("bold")}
          >
            <strong>B</strong>
          </button>
          <button
            className={classNames(styles.formatBtn, {
              [styles.active]: nodeStyle.italic,
            })}
            onClick={() => onToggle("italic")}
          >
            <em>I</em>
          </button>
          <button
            className={classNames(styles.formatBtn, {
              [styles.active]: nodeStyle.strikethrough,
            })}
            onClick={() => onToggle("strikethrough")}
          >
            <span style={{ textDecoration: "line-through" }}>S</span>
          </button>
          <button className={styles.clearBtn} onClick={onClearFormat}>
            Clear all
          </button>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Text Color</div>
        <div className={styles.swatchRow}>
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              className={classNames(styles.swatch, {
                [styles.swatchSelected]: nodeStyle.color === color,
              })}
              style={{ background: color }}
              onClick={() =>
                onSetColor(nodeStyle.color === color ? undefined : color)
              }
              title={color}
            />
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Background Color</div>
        <div className={styles.swatchRow}>
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              className={classNames(styles.swatch, {
                [styles.swatchSelected]: nodeStyle.backgroundColor === color,
              })}
              style={{ background: color }}
              onClick={() =>
                onSetBackground(
                  nodeStyle.backgroundColor === color ? undefined : color,
                )
              }
              title={color}
            />
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Presets</div>
        <div className={styles.presetGrid}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className={styles.presetChip}
              style={{
                color: preset.color,
                backgroundColor: preset.backgroundColor,
              }}
              onClick={() => onApplyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
