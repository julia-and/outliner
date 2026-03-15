import React, { useEffect, useRef, useState } from "react"
import {
  SHORTCUT_DEFS,
  KeyBinding,
  ShortcutDef,
  findConflict,
  formatBinding,
  getBindings,
  getStoredOverrides,
  resetBinding,
  setBinding,
} from "../utils/shortcuts"
import styles from "./KeyboardShortcuts.module.css"

interface Props {
  open: boolean
  onClose: () => void
}

export function KeyboardShortcuts({ open, onClose }: Props) {
  const [bindings, setBindingsState] = useState<Record<string, KeyBinding>>({})
  const [overrides, setOverrides] = useState<Record<string, KeyBinding>>({})
  const [capturing, setCapturing] = useState<string | null>(null)
  const [conflictLabel, setConflictLabel] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setBindingsState(getBindings())
      setOverrides(getStoredOverrides())
      setCapturing(null)
      setConflictLabel(null)
      // Focus modal so keyboard events land here
      setTimeout(() => modalRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (capturing) {
      // Ignore bare modifier keys
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()

      if (e.key === "Escape") {
        setCapturing(null)
        setConflictLabel(null)
        return
      }

      const newBinding: KeyBinding = {
        key: e.key,
        cmd: navigator.platform.toUpperCase().includes("MAC")
          ? e.metaKey
          : e.ctrlKey,
        shift: e.shiftKey || undefined,
        alt: e.altKey || undefined,
      }
      // Clean up false-y modifiers
      if (!newBinding.cmd) delete newBinding.cmd
      if (!newBinding.shift) delete newBinding.shift
      if (!newBinding.alt) delete newBinding.alt

      const conflictId = findConflict(capturing, newBinding, bindings)
      if (conflictId) {
        const def = SHORTCUT_DEFS.find((d) => d.id === conflictId)
        setConflictLabel(def?.label ?? conflictId)
        return
      }

      setBinding(capturing, newBinding)
      setBindingsState((prev) => ({ ...prev, [capturing]: newBinding }))
      setOverrides((prev) => ({ ...prev, [capturing]: newBinding }))
      setCapturing(null)
      setConflictLabel(null)
      return
    }

    if (e.key === "Escape") {
      onClose()
    }
  }

  const handleReset = (id: string) => {
    resetBinding(id)
    setBindingsState(getBindings())
    setOverrides(getStoredOverrides())
  }

  const groups = ["Navigation", "Structure", "Editing"] as const

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        tabIndex={-1}
        onKeyDown={handleModalKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {conflictLabel && (
          <div className={styles.conflict}>
            Conflicts with &ldquo;{conflictLabel}&rdquo; — press a different key
          </div>
        )}

        <div className={styles.body}>
          {groups.map((group) => {
            const defs = SHORTCUT_DEFS.filter((d) => d.group === group)
            return (
              <div key={group} className={styles.group}>
                <div className={styles.groupLabel}>{group}</div>
                {defs.map((def) => (
                  <ShortcutRow
                    key={def.id}
                    def={def}
                    binding={bindings[def.id] ?? def.defaultBinding}
                    isOverridden={!!overrides[def.id]}
                    isCapturing={capturing === def.id}
                    onStartCapture={() => {
                      if (def.remappable !== false) {
                        setCapturing(def.id)
                        setConflictLabel(null)
                      }
                    }}
                    onReset={() => handleReset(def.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>

        <div className={styles.footer}>
          Click a shortcut to remap · Esc to close
        </div>
      </div>
    </div>
  )
}

interface RowProps {
  def: ShortcutDef
  binding: KeyBinding
  isOverridden: boolean
  isCapturing: boolean
  onStartCapture: () => void
  onReset: () => void
}

function ShortcutRow({
  def,
  binding,
  isOverridden,
  isCapturing,
  onStartCapture,
  onReset,
}: RowProps) {
  const isRemappable = def.remappable !== false

  return (
    <div className={`${styles.row} ${isCapturing ? styles.rowCapturing : ""}`}>
      <span className={styles.rowLabel}>{def.label}</span>
      <div className={styles.badges}>
        {isCapturing ? (
          <span className={`${styles.badge} ${styles.badgeCapturing}`}>
            Press a key…
          </span>
        ) : (
          <>
            <span
              className={`${styles.badge} ${isRemappable ? styles.badgeClickable : ""}`}
              onClick={isRemappable ? onStartCapture : undefined}
              title={isRemappable ? "Click to remap" : undefined}
            >
              {formatBinding(binding)}
            </span>
            {def.alias && (
              <span className={`${styles.badge} ${styles.badgeAlias}`}>
                {formatBinding(def.alias)}
              </span>
            )}
            {isOverridden && (
              <button
                className={styles.resetBtn}
                onClick={onReset}
                title="Reset to default"
              >
                ↺
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
