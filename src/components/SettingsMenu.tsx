import { useState, type ChangeEvent } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { Settings, Columns, Rows, Keyboard } from "lucide-react"
import classNames from "classnames"
import { Popover } from "./Popover"
import { LOCALES, type Locale } from "../i18n"
import styles from "./SettingsMenu.module.css"

interface SettingsMenuProps {
  direction: "horizontal" | "vertical"
  onSetDirection: (d: "horizontal" | "vertical") => void
  locale: Locale
  onLocaleChange: (e: ChangeEvent<HTMLSelectElement>) => void
  onOpenShortcuts: () => void
  version: string
}

// Gear popover on the right of the top bar, consolidating the low-frequency
// app settings (layout, language, shortcuts, version). Dark mode and sync stay
// as visible one-click toolbar buttons.
export const SettingsMenu = ({
  direction,
  onSetDirection,
  locale,
  onLocaleChange,
  onOpenShortcuts,
  version,
}: SettingsMenuProps) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      offset={8}
      trigger={
        <button className={styles.gearBtn} aria-label={t`Settings`} title={t`Settings`}>
          <Settings size={18} />
        </button>
      }
    >
      <div className={styles.menu}>
        <div className={styles.row}>
          <span className={styles.label}><Trans>Layout</Trans></span>
          <div className={styles.segmented} role="group" aria-label={t`Layout`}>
            <button
              className={classNames(styles.segBtn, direction === "horizontal" && styles.segActive)}
              onClick={() => onSetDirection("horizontal")}
              title={t`Side by side`}
              aria-pressed={direction === "horizontal"}
            >
              <Columns size={16} />
            </button>
            <button
              className={classNames(styles.segBtn, direction === "vertical" && styles.segActive)}
              onClick={() => onSetDirection("vertical")}
              title={t`Stacked`}
              aria-pressed={direction === "vertical"}
            >
              <Rows size={16} />
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label}><Trans>Language</Trans></span>
          <select className={styles.select} value={locale} onChange={onLocaleChange}>
            {Object.entries(LOCALES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>

        <div className={styles.divider} />

        <button
          className={styles.menuItem}
          onClick={() => {
            setOpen(false)
            onOpenShortcuts()
          }}
        >
          <Keyboard size={16} className={styles.menuItemIcon} />
          <span className={styles.menuItemLabel}><Trans>Keyboard shortcuts</Trans></span>
          <kbd className={styles.kbd}>?</kbd>
        </button>

        <div className={styles.divider} />

        <div className={styles.version}>v{version}</div>
      </div>
    </Popover>
  )
}
