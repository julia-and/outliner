import React, { useState, useEffect, useCallback } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { Panel, Group, Separator } from "react-resizable-panels"
import {
  Columns,
  Keyboard,
  Rows,
  Moon,
  Sun,
  Monitor,
  Cloud,
  CloudOff,
  RefreshCw,
} from "lucide-react"
import {
  getPanelLayout,
  setPanelLayout,
  getLayoutDirection,
  setLayoutDirection,
  getThemeMode,
  setThemeMode,
  type ThemeMode,
  db,
} from "../store"
import type { SyncState } from "dexie-cloud-addon"
import { LOCALES, getLocale, loadLocale, type Locale } from "../i18n"
import styles from "./SplitLayout.module.css"
import { KeyboardShortcuts } from "./KeyboardShortcuts"
import { onMenuCommand } from "../desktop/menuBridge"
type SyncStatePhase = SyncState["phase"]

interface SplitLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
  outlineSwitcher?: React.ReactNode
  templateManager?: React.ReactNode
}

export const SplitLayout = ({ left, right, outlineSwitcher, templateManager }: SplitLayoutProps) => {
  const [direction, setDirection] = useState<"horizontal" | "vertical">(
    getLayoutDirection,
  )
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode)
  const [syncPhase, setSyncPhase] = useState<SyncStatePhase>("initial")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [locale, setLocaleState] = useState<Locale>(getLocale)

  const handleLocaleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Locale
    setLocaleState(next)
    loadLocale(next)
  }, [])

  useEffect(() => {
    const s1 = db.cloud.syncState.subscribe((s) => setSyncPhase(s.phase))
    const s2 = db.cloud.currentUser.subscribe((u) =>
      setIsLoggedIn(!!u.isLoggedIn),
    )
    return () => {
      s1.unsubscribe()
      s2.unsubscribe()
    }
  }, [])

  // Resolve theme to a concrete light/dark value and keep it in sync with the
  // OS when in "system" mode (e.g. macOS auto light/dark schedule).
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const resolved =
        themeMode === "system" ? (mql.matches ? "dark" : "light") : themeMode
      document.documentElement.dataset.theme = resolved
    }
    apply()
    if (themeMode === "system") {
      mql.addEventListener("change", apply)
      return () => mql.removeEventListener("change", apply)
    }
  }, [themeMode])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as Element
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        (target as HTMLElement).isContentEditable
      )
        return
      if (e.key === "?") {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const toggleDirection = () => {
    setDirection((prev) => {
      const next = prev === "horizontal" ? "vertical" : "horizontal"
      setLayoutDirection(next)
      return next
    })
  }

  const cycleTheme = () => {
    setThemeModeState((prev) => {
      const order = ["system", "light", "dark"] as const
      const next = order[(order.indexOf(prev) + 1) % order.length]!
      setThemeMode(next)
      return next
    })
  }

  // Native (Tauri) View-menu commands. Inert on the web.
  useEffect(() => {
    const setTheme = (mode: ThemeMode) => {
      setThemeModeState(mode)
      setThemeMode(mode)
    }
    const unsubs = [
      onMenuCommand("toggle-layout", () =>
        setDirection((prev) => {
          const next = prev === "horizontal" ? "vertical" : "horizontal"
          setLayoutDirection(next)
          return next
        }),
      ),
      onMenuCommand("theme-system", () => setTheme("system")),
      onMenuCommand("theme-light", () => setTheme("light")),
      onMenuCommand("theme-dark", () => setTheme("dark")),
      onMenuCommand("show-shortcuts", () => setShowShortcuts(true)),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.toolbar} data-tauri-drag-region>
        {outlineSwitcher && (
          <>
            {outlineSwitcher}
            <div className={styles.divider} />
          </>
        )}
        {templateManager && (
          <>
            {templateManager}
            <div className={styles.divider} />
          </>
        )}
        <button
          onClick={toggleDirection}
          className={styles.button}
          title={t`Toggle Layout`}
        >
          {direction === "horizontal" ? (
            <Columns size={20} />
          ) : (
            <Rows size={20} />
          )}
        </button>
        <button
          onClick={cycleTheme}
          className={styles.button}
          title={
            themeMode === "system"
              ? t`Theme: System (click for Light)`
              : themeMode === "light"
                ? t`Theme: Light (click for Dark)`
                : t`Theme: Dark (click for System)`
          }
        >
          {themeMode === "system" ? (
            <Monitor size={20} />
          ) : themeMode === "light" ? (
            <Sun size={20} />
          ) : (
            <Moon size={20} />
          )}
        </button>
        <div className={styles.divider} />
        <SyncButton phase={syncPhase} isLoggedIn={isLoggedIn} />
        <div className={styles.divider} />
        <select
          className={styles.localeSelect}
          value={locale}
          onChange={handleLocaleChange}
        >
          {Object.entries(LOCALES).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <div className={styles.spacer} />
        <span className={styles.commitHash}>{__COMMIT_HASH__}</span>
        <button
          onClick={() => setShowShortcuts(true)}
          className={styles.button}
          title={t`Keyboard Shortcuts (?)`}
        >
          <Keyboard size={18} />
        </button>
      </div>
      <KeyboardShortcuts
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
      <div className={styles.content}>
        <Group
          orientation={direction}
          defaultLayout={getPanelLayout() ?? undefined}
          onLayoutChanged={setPanelLayout}
        >
          <Panel id="left" defaultSize="40%" minSize="20%">
            <div className={styles.paneContainer}>{left}</div>
          </Panel>
          <Separator className={styles.resizer} />
          <Panel id="right" minSize="20%">
            <div className={styles.paneContainer}>{right}</div>
          </Panel>
        </Group>
      </div>
    </div>
  )
}

function SyncButton({
  phase,
  isLoggedIn,
}: {
  phase: SyncStatePhase
  isLoggedIn: boolean
}) {
  const syncing = phase === "pushing" || phase === "pulling"
  const offline = phase === "offline" || phase === "error"

  const icon = syncing ? (
    <RefreshCw size={18} className={styles.spin} />
  ) : offline ? (
    <CloudOff size={18} />
  ) : (
    <Cloud size={18} />
  )

  const title = syncing
    ? t`Syncing…`
    : offline
      ? t`Offline`
      : isLoggedIn
        ? t`Synced`
        : t`Sign in to sync`

  return (
    <button
      className={styles.button}
      title={title}
      onClick={() => {
        if (isLoggedIn) {
          if (confirm(t`Sign out and stop syncing?`)) db.cloud.logout()
        } else {
          db.cloud.login()
        }
      }}
      style={
        isLoggedIn && !offline && !syncing
          ? { color: "var(--sync-ok)" }
          : undefined
      }
    >
      {icon}
      {!isLoggedIn && <span className={styles.syncLabel}><Trans>Sign in</Trans></span>}
    </button>
  )
}
