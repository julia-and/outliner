import { useState, useEffect, useRef, type ReactNode } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react"
import { Search, Plus, Upload, Moon, FileText } from "lucide-react"
import { useLiveQuery } from "dexie-react-hooks"
import classNames from "classnames"
import { db, createOutline, importDocxAsOutline, toggleDarkMode } from "../store"
import { IS_MAC } from "../utils/shortcuts"
import styles from "./CommandPalette.module.css"

interface Props {
  onSelectOutline: (id: string) => void
}

type Item = {
  kind: "outline" | "action"
  key: string
  label: string
  icon: ReactNode
  run: () => void
}

// Global Cmd+K (Ctrl+K) palette: filter/switch outlines and run a few quick
// actions. Mounted once at the app root; owns its own open state.
export function CommandPalette({ onSelectOutline }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  // Subscribe to locale changes so the t-macro action labels below refresh on a runtime language switch.
  useLingui()

  const outlines = useLiveQuery(() => db.outlines.orderBy("createdAt").toArray(), [], [])

  useEffect(() => {
    // Capture phase so the palette wins over the editor's own keymaps.
    const onKey = (e: KeyboardEvent) => {
      const mod = IS_MAC ? e.metaKey : e.ctrlKey
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [])

  useEffect(() => {
    if (!open) return
    // Remember what had focus (usually the outline container) so closing the
    // palette returns focus there — otherwise focus lands on <body> and the
    // outline's keyboard navigation goes dead until the user clicks back in.
    prevFocus.current = document.activeElement as HTMLElement | null
    setQuery("")
    setSelected(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => prevFocus.current?.focus()
  }, [open])

  const q = query.trim().toLowerCase()
  const name = query.trim()

  const outlineItems: Item[] = outlines
    .filter((o) => o.name.toLowerCase().includes(q))
    .map((o) => ({
      kind: "outline",
      key: `o:${o.id}`,
      label: o.name,
      icon: <FileText size={14} />,
      run: () => {
        onSelectOutline(o.id)
        setOpen(false)
      },
    }))

  const actions: (Item & { always?: boolean })[] = [
    {
      kind: "action",
      key: "a:new",
      always: true,
      label: name ? t`New outline "${name}"` : t`New outline`,
      icon: <Plus size={14} />,
      run: async () => {
        setOpen(false)
        const id = await createOutline(name || t`Untitled`)
        onSelectOutline(id)
      },
    },
    {
      kind: "action",
      key: "a:import",
      label: t`Import from Word`,
      icon: <Upload size={14} />,
      run: () => {
        setOpen(false)
        fileInputRef.current?.click()
      },
    },
    {
      kind: "action",
      key: "a:dark",
      label: t`Toggle dark mode`,
      icon: <Moon size={14} />,
      run: () => {
        toggleDarkMode()
        setOpen(false)
      },
    },
  ]

  // "New outline" always shows (it uses the query as the name); other
  // actions filter by their label so they stay findable but out of the way.
  const actionItems = actions.filter((a) => a.always || !q || a.label.toLowerCase().includes(q))
  const items: Item[] = [...outlineItems, ...actionItems]

  const activeIdx = items.length ? Math.min(selected, items.length - 1) : -1

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" })
  }, [activeIdx, open])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const id = await importDocxAsOutline(file)
    onSelectOutline(id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      // Step from the clamped, visible highlight (activeIdx), not the raw
      // stored index — the live list can shrink under us (delete/sync).
      setSelected(items.length ? (activeIdx + 1) % items.length : 0)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected(items.length ? (activeIdx - 1 + items.length) % items.length : 0)
    } else if (e.key === "Enter") {
      e.preventDefault()
      items[activeIdx]?.run()
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      {open && (
        <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
          <div
          className={styles.palette}
          role="dialog"
          aria-modal="true"
          aria-label={t`Command palette`}
          onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={styles.searchRow}>
              <Search size={16} className={styles.searchIcon} />
              <input
                ref={inputRef}
                className={styles.input}
                placeholder={t`Search outlines or run a command…`}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelected(0)
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
            {/* Always non-empty: the "New outline" action is always present. */}
            <div className={styles.list} ref={listRef} role="listbox">
              {items.map((item, i) => {
                const prev = items[i - 1]
                const showHeader = !prev || prev.kind !== item.kind
                return (
                  <div key={item.key}>
                    {showHeader && (
                      <div className={styles.sectionLabel}>
                        {item.kind === "outline" ? (
                          <Trans context="command palette section">Outlines</Trans>
                        ) : (
                          <Trans context="command palette section">Actions</Trans>
                        )}
                      </div>
                    )}
                    <button
                      className={classNames(styles.item, i === activeIdx && styles.itemActive)}
                      data-active={i === activeIdx}
                      role="option"
                      aria-selected={i === activeIdx}
                      onMouseMove={() => setSelected(i)}
                      onClick={() => item.run()}
                    >
                      <span className={styles.itemIcon}>{item.icon}</span>
                      <span className={styles.itemLabel}>{item.label}</span>
                    </button>
                  </div>
                )
              })}
            </div>
            <div className={styles.footer}>
              <Trans>↑↓ to navigate · ↵ to select · Esc to close</Trans>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
