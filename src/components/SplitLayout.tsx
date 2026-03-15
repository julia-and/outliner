import React, { useState, useEffect } from "react"
import { Panel, Group, Separator } from "react-resizable-panels"
import {
  Columns,
  Keyboard,
  Rows,
  Moon,
  Sun,
  Cloud,
  CloudOff,
  RefreshCw,
} from "lucide-react"
import {
  getPanelLayout,
  setPanelLayout,
  getLayoutDirection,
  setLayoutDirection,
  getDarkMode,
  setDarkMode,
  db,
} from "../store"
import type { SyncState } from "dexie-cloud-addon"
import styles from "./SplitLayout.module.css"
import { KeyboardShortcuts } from "./KeyboardShortcuts"
type SyncStatePhase = SyncState["phase"]

interface SplitLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
}

export const SplitLayout = ({ left, right }: SplitLayoutProps) => {
  const [direction, setDirection] = useState<"horizontal" | "vertical">(
    getLayoutDirection,
  )
  const [darkMode, setDarkModeState] = useState(getDarkMode)
  const [syncPhase, setSyncPhase] = useState<SyncStatePhase>("initial")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

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

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light"
  }, [darkMode])

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

  const toggleDarkMode = () => {
    setDarkModeState((prev) => {
      const next = !prev
      setDarkMode(next)
      return next
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button
          onClick={toggleDirection}
          className={styles.button}
          title="Toggle Layout"
        >
          {direction === "horizontal" ? (
            <Columns size={20} />
          ) : (
            <Rows size={20} />
          )}
        </button>
        <button
          onClick={toggleDarkMode}
          className={styles.button}
          title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div className={styles.divider} />
        <SyncButton phase={syncPhase} isLoggedIn={isLoggedIn} />
        <div className={styles.spacer} />
        <button
          onClick={() => setShowShortcuts(true)}
          className={styles.button}
          title="Keyboard Shortcuts (?)"
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
    ? "Syncing…"
    : offline
      ? "Offline"
      : isLoggedIn
        ? "Synced"
        : "Sign in to sync"

  return (
    <button
      className={styles.button}
      title={title}
      onClick={() => (isLoggedIn ? db.cloud.logout() : db.cloud.login())}
      style={
        isLoggedIn && !offline && !syncing
          ? { color: "var(--sync-ok)" }
          : undefined
      }
    >
      {icon}
      {!isLoggedIn && <span className={styles.syncLabel}>Sign in</span>}
    </button>
  )
}
