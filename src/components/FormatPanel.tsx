import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import classNames from "classnames"
import { NodeStyle } from "../types"
import { TemplateRow } from "../store"
import { COLOR_PALETTE, PRESETS } from "../utils/palette"
import styles from "./FormatPanel.module.css"

interface FormatPanelProps {
  nodeStyle: NodeStyle
  onToggle: (key: "bold" | "italic" | "strikethrough") => void
  onClearFormat: () => void
  onSetColor: (color: string | undefined) => void
  onSetBackground: (color: string | undefined) => void
  onApplyPreset: (preset: { color: string; backgroundColor: string }) => void
  templates?: TemplateRow[]
  defaultChildTemplateId?: string
  onSetDefaultChildTemplate?: (id: string | null) => void
}

export const FormatPanel = ({
  nodeStyle,
  onToggle,
  onClearFormat,
  onSetColor,
  onSetBackground,
  onApplyPreset,
  templates,
  defaultChildTemplateId,
  onSetDefaultChildTemplate,
}: FormatPanelProps) => {
  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionLabel}><Trans>Text Format</Trans></div>
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
            <Trans>Clear all</Trans>
          </button>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}><Trans>Text Color</Trans></div>
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
        <div className={styles.sectionLabel}><Trans>Background Color</Trans></div>
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
        <div className={styles.sectionLabel}><Trans>Presets</Trans></div>
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

      {onSetDefaultChildTemplate && (
        <>
          <div className={styles.divider} />
          <div className={styles.section}>
            <div className={styles.sectionLabel}><Trans>Default child template</Trans></div>
            <select
              className={styles.templateSelect}
              value={defaultChildTemplateId ?? ""}
              onChange={(e) =>
                onSetDefaultChildTemplate(e.target.value || null)
              }
            >
              <option value="">{t`None`}</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

    </div>
  )
}
