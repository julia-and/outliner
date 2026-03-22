import { useState, useRef, useEffect } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { LayoutTemplate, Plus, Pencil, Trash2, FileEdit } from "lucide-react"
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
import { Crepe } from "@milkdown/crepe"
import "@milkdown/crepe/theme/common/style.css"
import { createHighlightPlugins } from "../editor/highlightPlugin"
import { createCalloutPlugins } from "../editor/calloutPlugin"
import { createPlaceholderPlugins } from "../editor/placeholderPlugin"
import classNames from "classnames"
import { db, createTemplate, updateTemplate, deleteTemplate } from "../store"
import styles from "./TemplateManager.module.css"

// --- Template content editor ---

const TemplateContentEditor = ({
  defaultValue,
  onSave,
  onCancel,
}: {
  defaultValue: string
  onSave: (markdown: string) => void
  onCancel: () => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const noopPickerRef = useRef(() => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const crepe = new Crepe({ root: container, defaultValue })
    crepe.editor.use([
      ...createHighlightPlugins(),
      ...createCalloutPlugins({ onPickerRef: noopPickerRef }),
      ...createPlaceholderPlugins(),
    ])
    crepeRef.current = crepe
    crepe.create()
    return () => {
      crepe.destroy()
      crepeRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className={styles.editorBody}>
        <div ref={containerRef} className={styles.editorInner} />
      </div>
      <div className={styles.editorFooter}>
        <button className={styles.cancelBtn} onClick={onCancel}>
          <Trans>Cancel</Trans>
        </button>
        <button
          className={styles.saveBtn}
          onClick={() => {
            if (crepeRef.current) onSave(crepeRef.current.getMarkdown())
          }}
        >
          <Trans>Save</Trans>
        </button>
      </div>
    </>
  )
}

// --- Main TemplateManager component ---

export const TemplateManager = () => {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [contentEditorId, setContentEditorId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const templates = useLiveQuery(() => db.templates.orderBy("createdAt").toArray(), []) ?? []

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
    const name = t`Untitled Template`
    const id = await createTemplate(name, "")
    setEditingId(id)
    setEditingName(name)
    setConfirmDeleteId(null)
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
    if (trimmed && id) void updateTemplate(id, { name: trimmed })
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
    setConfirmDeleteId(null)
    await deleteTemplate(id)
  }

  const handleEditContent = (id: string) => {
    setOpen(false)
    setContentEditorId(id)
  }

  const handleSaveContent = async (markdown: string) => {
    if (contentEditorId) await updateTemplate(contentEditorId, { content: markdown })
    setContentEditorId(null)
  }

  const contentEditorTemplate = contentEditorId
    ? templates.find((tp) => tp.id === contentEditorId)
    : null

  const isBusy = editingId !== null || confirmDeleteId !== null

  return (
    <>
      <button
        ref={refs.setReference}
        className={styles.trigger}
        title={t`Manage templates`}
        {...getReferenceProps()}
      >
        <LayoutTemplate size={18} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className={classNames(styles.dropdown, { [styles.dropdownBusy]: isBusy })}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {templates.map((tmpl) => {
              if (editingId === tmpl.id) {
                return (
                  <div key={tmpl.id} className={styles.itemRow}>
                    <input
                      ref={renameInputRef}
                      className={styles.renameInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={handleRenameCommit}
                    />
                  </div>
                )
              }

              if (confirmDeleteId === tmpl.id) {
                return (
                  <div key={tmpl.id} className={classNames(styles.itemRow, styles.itemRowConfirm)}>
                    <span className={styles.confirmLabel}>{t`Delete "${tmpl.name}"?`}</span>
                    <div className={styles.confirmActions}>
                      <button className={styles.confirmCancel} onClick={() => setConfirmDeleteId(null)}><Trans>Cancel</Trans></button>
                      <button className={styles.confirmDelete} onClick={() => handleConfirmDelete(tmpl.id)}><Trans>Delete</Trans></button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={tmpl.id} className={styles.itemRow}>
                  <button className={styles.itemInner} onClick={() => handleEditContent(tmpl.id)}>
                    <span className={styles.itemName}>{tmpl.name}</span>
                  </button>
                  <div className={styles.rowActions}>
                    <button
                      className={styles.iconBtn}
                      onClick={(e) => { e.stopPropagation(); handleStartRename(tmpl.id, tmpl.name) }}
                      title={t`Rename`}
                      tabIndex={-1}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className={styles.iconBtn}
                      onClick={(e) => { e.stopPropagation(); handleEditContent(tmpl.id) }}
                      title={t`Edit content`}
                      tabIndex={-1}
                    >
                      <FileEdit size={12} />
                    </button>
                    <button
                      className={classNames(styles.iconBtn, styles.iconBtnDanger)}
                      onClick={(e) => { e.stopPropagation(); handleStartDelete(tmpl.id) }}
                      title={t`Delete`}
                      tabIndex={-1}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
            {templates.length > 0 && <div className={styles.divider} />}
            <button className={styles.item} onClick={handleCreate}>
              <Plus size={12} className={styles.plusIcon} />
              <span className={styles.itemName}><Trans>New template</Trans></span>
            </button>
          </div>
        </FloatingPortal>
      )}

      {contentEditorId && (
        <FloatingPortal>
          <div className={styles.backdrop} onClick={() => setContentEditorId(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span className={styles.modalTitle}>
                  {contentEditorTemplate?.name ?? t`Edit Template`}
                </span>
                <button className={styles.closeBtn} onClick={() => setContentEditorId(null)}>✕</button>
              </div>
              <TemplateContentEditor
                key={contentEditorId}
                defaultValue={contentEditorTemplate?.content ?? ""}
                onSave={handleSaveContent}
                onCancel={() => setContentEditorId(null)}
              />
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
