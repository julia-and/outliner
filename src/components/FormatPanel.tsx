import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import classNames from "classnames"
import { NodeStyle } from "../types"
import { TemplateRow } from "../store"
import { COLOR_PALETTE, PRESETS } from "../utils/palette"
import styles from "./FormatPanel.module.css"

interface FormatPanelProps {
  nodeStyle: NodeStyle
  hasChildren: boolean
  onToggle: (key: "bold" | "italic" | "strikethrough", recursive: boolean) => void
  onClearFormat: (recursive: boolean) => void
  onSetColor: (color: string | undefined, recursive: boolean) => void
  onSetBackground: (color: string | undefined, recursive: boolean) => void
  onApplyPreset: (
    preset: { color: string; backgroundColor: string },
    recursive: boolean,
  ) => void
  templates?: TemplateRow[]
  defaultChildTemplateId?: string
  onSetDefaultChildTemplate?: (id: string | null) => void
}

export const FormatPanel = ({
  nodeStyle,
  hasChildren,
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
            onClick={(e) => onToggle("bold", e.shiftKey)}
            title={t`Click to toggle (Shift+click to apply to children)`}
          >
            <strong>B</strong>
          </button>
          <button
            className={classNames(styles.formatBtn, {
              [styles.active]: nodeStyle.italic,
            })}
            onClick={(e) => onToggle("italic", e.shiftKey)}
            title={t`Click to toggle (Shift+click to apply to children)`}
          >
            <em>I</em>
          </button>
          <button
            className={classNames(styles.formatBtn, {
              [styles.active]: nodeStyle.strikethrough,
            })}
            onClick={(e) => onToggle("strikethrough", e.shiftKey)}
            title={t`Click to toggle (Shift+click to apply to children)`}
          >
            <span style={{ textDecoration: "line-through" }}>S</span>
          </button>
          <button
            className={styles.clearBtn}
            onClick={(e) => onClearFormat(e.shiftKey)}
          >
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
              onClick={(e) =>
                onSetColor(
                  nodeStyle.color === color ? undefined : color,
                  e.shiftKey,
                )
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
              onClick={(e) =>
                onSetBackground(
                  nodeStyle.backgroundColor === color ? undefined : color,
                  e.shiftKey,
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
              onClick={(e) => onApplyPreset(preset, e.shiftKey)}
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

      {hasChildren && (
        <div className={styles.hint}>
          <Trans>Hold Shift to apply to children</Trans>
        </div>
      )}
    </div>
  )
}
