import { useState, useRef, useEffect } from "react"
import { ChevronDown, Plus, Check, Pencil, Trash2, Upload, Download } from "lucide-react"
import { useLiveQuery } from "dexie-react-hooks"
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react"
import classNames from "classnames"
import { db, createOutline, renameOutline, deleteOutline, importDocxAsOutline, exportOutlineToFile, importOutlineFromFile } from "../store"
import styles from "./OutlineSwitcher.module.css"

interface OutlineSwitcherProps {
  activeOutlineId: string | null
  onSelect: (id: string) => void
}

export const OutlineSwitcher = ({ activeOutlineId, onSelect }: OutlineSwitcherProps) => {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importingOlz, setImportingOlz] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const olzFileInputRef = useRef<HTMLInputElement>(null)

  const outlines = useLiveQuery(() => db.outlines.orderBy("createdAt").toArray(), []) ?? []
  const active = outlines.find((o) => o.id === activeOutlineId)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss])

  useEffect(() => {
    if (editingId) requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }, [editingId])

  const handleCreate = async () => {
    const id = await createOutline("Untitled")
    onSelect(id)
    setEditingId(id)
    setEditingName("Untitled")
    setConfirmDeleteId(null)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImporting(true)
    try {
      const id = await importDocxAsOutline(file)
      onSelect(id)
      setOpen(false)
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async (id: string) => {
    setExporting(true)
    try {
      await exportOutlineToFile(id)
    } finally {
      setExporting(false)
    }
  }

  const handleOlzImportClick = () => {
    olzFileInputRef.current?.click()
  }

  const handleOlzFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImportingOlz(true)
    try {
      const id = await importOutlineFromFile(file)
      onSelect(id)
      setOpen(false)
    } finally {
      setImportingOlz(false)
    }
  }

  const handleSelect = (id: string) => {
    if (editingId !== null || confirmDeleteId !== null) return
    onSelect(id)
    setOpen(false)
  }

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
    setConfirmDeleteId(null)
  }

  const handleRenameCommit = () => {
    const trimmed = editingName.trim()
    const id = editingId
    setEditingId(null)
    setEditingName("")
    if (trimmed && id) void renameOutline(id, trimmed)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameCommit()
    else if (e.key === "Escape") { setEditingId(null); setEditingName("") }
  }

  const handleStartDelete = (id: string) => {
    setConfirmDeleteId(id)
    setEditingId(null)
    setEditingName("")
  }

  const handleConfirmDelete = async (id: string) => {
    const remaining = outlines.filter(o => o.id !== id)
    setConfirmDeleteId(null)
    await deleteOutline(id)
    if (id === activeOutlineId) {
      if (remaining.length > 0) {
        onSelect(remaining[0].id)
      } else {
        const newId = await createOutline("Untitled")
        onSelect(newId)
        setEditingId(newId)
        setEditingName("Untitled")
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        ref={olzFileInputRef}
        type="file"
        accept=".olz"
        style={{ display: "none" }}
        onChange={handleOlzFileChange}
      />
      <button
        ref={refs.setReference}
        className={styles.trigger}
        title="Switch outline"
        {...getReferenceProps()}
      >
        <span className={styles.name}>
          {active?.name ?? "—"}
        </span>
        <ChevronDown size={12} className={open ? styles.chevronOpen : styles.chevron} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className={classNames(styles.dropdown, {
              [styles.dropdownBusy]: editingId !== null || confirmDeleteId !== null,
            })}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {outlines.map((o) => {
              if (editingId === o.id) {
                return (
                  <div key={o.id} className={styles.itemRow}>
                    <Check size={12} className={o.id === activeOutlineId ? styles.checkVisible : styles.checkHidden} />
                    <input
                      ref={renameInputRef}
                      className={styles.renameInput}
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={handleRenameCommit}
                    />
                  </div>
                )
              }

              if (confirmDeleteId === o.id) {
                return (
                  <div key={o.id} className={classNames(styles.itemRow, styles.itemRowConfirm)}>
                    <span className={styles.confirmLabel}>Delete "{o.name}"?</span>
                    <div className={styles.confirmActions}>
                      <button className={styles.confirmCancel} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      <button className={styles.confirmDelete} onClick={() => handleConfirmDelete(o.id)}>Delete</button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={o.id} className={styles.itemRow}>
                  <button className={styles.itemInner} onClick={() => handleSelect(o.id)}>
                    <Check size={12} className={o.id === activeOutlineId ? styles.checkVisible : styles.checkHidden} />
                    <span className={styles.itemName}>{o.name}</span>
                  </button>
                  <div className={styles.rowActions}>
                    <button
                      className={styles.iconBtn}
                      onClick={e => { e.stopPropagation(); handleStartRename(o.id, o.name) }}
                      title="Rename"
                      tabIndex={-1}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className={styles.iconBtn}
                      onClick={e => { e.stopPropagation(); void handleExport(o.id) }}
                      title="Export to file"
                      disabled={exporting}
                      tabIndex={-1}
                    >
                      <Download size={12} />
                    </button>
                    <button
                      className={classNames(styles.iconBtn, styles.iconBtnDanger)}
                      onClick={e => { e.stopPropagation(); handleStartDelete(o.id) }}
                      title="Delete"
                      tabIndex={-1}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
            {outlines.length > 0 && <div className={styles.divider} />}
            <button className={styles.item} onClick={handleCreate}>
              <Plus size={12} className={styles.plusIcon} />
              <span className={styles.itemName}>New outline</span>
            </button>
            <button className={styles.item} onClick={handleImportClick} disabled={importing}>
              <Upload size={12} className={styles.plusIcon} />
              <span className={styles.itemName}>{importing ? "Importing…" : "Import from Word"}</span>
            </button>
            <button className={styles.item} onClick={handleOlzImportClick} disabled={importingOlz}>
              <Upload size={12} className={styles.plusIcon} />
              <span className={styles.itemName}>{importingOlz ? "Importing…" : "Import from file (.olz)"}</span>
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
