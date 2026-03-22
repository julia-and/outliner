import React, { useRef, useState, useEffect, useCallback } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import * as Y from "yjs"
import { useVirtualizer } from "@tanstack/react-virtual"
import { OutlineRow } from "./OutlineRow"
import {
  updateStyle,
  createNode,
  toggleCollapse,
  moveNodeBefore,
  moveNodeAfter,
  moveNodeAsLastChild,
  setDefaultChildTemplate,
  TemplateRow,
} from "../store"
import { VirtualElement } from "@floating-ui/react"
import styles from "./OutlineView.module.css"
import { OutletNode } from "../types"
import { Popover } from "./Popover"
import { FormatPanel } from "./FormatPanel"
import { IconPickerPanel } from "./IconPickerPanel"

interface OutlineViewProps {
  outlineDoc: Y.Doc
  nodes: OutletNode[]
  activeId: string | null
  mode: "nav" | "insert"
  setActiveId: (id: string) => void
  setMode: (mode: "nav" | "insert") => void
  updateTitle: (id: string, title: string) => void
  handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => void
  handlePasteEvent: (e: React.ClipboardEvent) => void
  templates?: TemplateRow[]
  containerRef?: React.RefObject<HTMLDivElement | null>
}

type DropTarget = {
  nodeId: string
  index: number
  position: "before" | "after" | "into"
}

type DragState = {
  draggingId: string
  subtreeIds: Set<string>
  mouseX: number
  mouseY: number
  dropTarget: DropTarget | null
}

function getDraggingSubtree(id: string, nodes: OutletNode[]): Set<string> {
  const idx = nodes.findIndex((n) => n.id === id)
  if (idx === -1) return new Set([id])
  const result = new Set<string>()
  result.add(id)
  const baseDepth = nodes[idx].depth
  for (let i = idx + 1; i < nodes.length; i++) {
    if (nodes[i].depth <= baseDepth) break
    result.add(nodes[i].id)
  }
  return result
}

function computeDropTarget(
  mouseY: number,
  container: HTMLDivElement,
  displayNodes: OutletNode[],
  virtualItems: Array<{ index: number; start: number; size: number }>,
  subtreeIds: Set<string>,
): DropTarget | null {
  const containerRect = container.getBoundingClientRect()
  const relativeY = mouseY - containerRect.top + container.scrollTop
  for (const vItem of virtualItems) {
    const node = displayNodes[vItem.index]
    if (!node || subtreeIds.has(node.id)) continue
    const itemTop = vItem.start
    const itemBottom = vItem.start + vItem.size
    if (relativeY >= itemTop && relativeY < itemBottom) {
      let position: DropTarget["position"]
      if (relativeY < itemTop + vItem.size * 0.3) position = "before"
      else if (relativeY > itemTop + vItem.size * 0.7) position = "after"
      else position = "into"
      return { nodeId: node.id, index: vItem.index, position }
    }
  }
  return null
}

export const OutlineView = ({
  outlineDoc,
  nodes,
  activeId,
  mode,
  setActiveId,
  setMode,
  updateTitle,
  handleKeyDown,
  handlePasteEvent,
  templates,
  containerRef,
}: OutlineViewProps) => {
  const parentRef = useRef<HTMLDivElement>(null)

  const [filterText, setFilterText] = useState("")
  const [contextMenu, setContextMenu] = useState<{
    open: boolean
    x: number
    y: number
    nodeId: string | null
  }>({ open: false, x: 0, y: 0, nodeId: null })
  const [iconPicker, setIconPicker] = useState<{
    open: boolean
    element: HTMLElement | null
    nodeId: string | null
  }>({ open: false, element: null, nodeId: null })

  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  const displayNodes = filterText.trim()
    ? nodes.filter((n) =>
        n.title.toLowerCase().includes(filterText.toLowerCase()),
      )
    : nodes

  const displayNodesRef = useRef(displayNodes)
  displayNodesRef.current = displayNodes

  const rowVirtualizer = useVirtualizer({
    count: displayNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 5,
  })
  const virtualizerRef = useRef(rowVirtualizer)
  virtualizerRef.current = rowVirtualizer

  // Focus management
  useEffect(() => {
    parentRef.current?.focus()
  }, [])

  useEffect(() => {
    if (mode === "nav") {
      parentRef.current?.focus({ preventScroll: true })
    }
  }, [mode])

  // Drag: start
  const startDrag = useCallback((id: string, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const subtreeIds = getDraggingSubtree(id, displayNodesRef.current)
    const newDs: DragState = {
      draggingId: id,
      subtreeIds,
      mouseX: e.clientX,
      mouseY: e.clientY,
      dropTarget: null,
    }
    dragStateRef.current = newDs
    setDragState(newDs)
  }, [])

  // Drag: global pointer handlers (only active while dragging)
  useEffect(() => {
    const draggingId = dragState?.draggingId
    if (!draggingId) return

    const handleMove = (e: PointerEvent) => {
      const container = parentRef.current
      const ds = dragStateRef.current
      if (!container || !ds) return
      const virtualItems = virtualizerRef.current.getVirtualItems()
      const dropTarget = computeDropTarget(
        e.clientY,
        container,
        displayNodesRef.current,
        virtualItems,
        ds.subtreeIds,
      )
      const newDs: DragState = {
        ...ds,
        mouseX: e.clientX,
        mouseY: e.clientY,
        dropTarget,
      }
      dragStateRef.current = newDs
      setDragState(newDs)
    }

    const handleUp = () => {
      const ds = dragStateRef.current
      if (ds?.dropTarget) {
        const { nodeId, position } = ds.dropTarget
        if (position === "before") moveNodeBefore(outlineDoc, ds.draggingId, nodeId)
        else if (position === "after") moveNodeAfter(outlineDoc, ds.draggingId, nodeId)
        else moveNodeAsLastChild(outlineDoc, ds.draggingId, nodeId)
      }
      dragStateRef.current = null
      setDragState(null)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        dragStateRef.current = null
        setDragState(null)
      }
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      window.removeEventListener("keydown", handleKeyDown)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState?.draggingId])

  // Drag: auto-scroll
  useEffect(() => {
    const draggingId = dragState?.draggingId
    if (!draggingId) return
    const container = parentRef.current
    if (!container) return

    let rafId: number
    const scroll = () => {
      const ds = dragStateRef.current
      if (!ds) return
      const rect = container.getBoundingClientRect()
      const threshold = 60
      const maxSpeed = 8
      const mouseY = ds.mouseY
      if (mouseY - rect.top < threshold && mouseY >= rect.top) {
        const factor = 1 - (mouseY - rect.top) / threshold
        container.scrollTop -= maxSpeed * factor
      } else if (rect.bottom - mouseY < threshold && mouseY <= rect.bottom) {
        const factor = 1 - (rect.bottom - mouseY) / threshold
        container.scrollTop += maxSpeed * factor
      }
      rafId = requestAnimationFrame(scroll)
    }
    rafId = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(rafId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState?.draggingId])

  const contextMenuVirtualRef: VirtualElement = {
    getBoundingClientRect: () => ({
      width: 0,
      height: 0,
      x: contextMenu.x,
      y: contextMenu.y,
      top: contextMenu.y,
      left: contextMenu.x,
      right: contextMenu.x,
      bottom: contextMenu.y,
    }),
  }

  const iconPickerVirtualRef: VirtualElement = {
    getBoundingClientRect: () =>
      iconPicker.element?.getBoundingClientRect() ?? new DOMRect(),
  }

  const handleContextMenu = (id: string, x: number, y: number) => {
    setIconPicker((prev) => ({ ...prev, open: false }))
    setContextMenu({ open: true, x, y, nodeId: id })
  }

  const handleBulletClick = (id: string, element: HTMLElement) => {
    setContextMenu((prev) => ({ ...prev, open: false }))
    setIconPicker({ open: true, element, nodeId: id })
  }

  const handleToggleFormat = (key: "bold" | "italic" | "strikethrough") => {
    if (!contextMenu.nodeId) return
    const node = nodes.find((n) => n.id === contextMenu.nodeId)
    if (node) {
      updateStyle(outlineDoc, contextMenu.nodeId, { [key]: !node.style[key] })
    }
  }

  const handleClearFormat = () => {
    if (!contextMenu.nodeId) return
    updateStyle(outlineDoc, contextMenu.nodeId, {
      bold: undefined,
      italic: undefined,
      strikethrough: undefined,
      color: undefined,
      backgroundColor: undefined,
    })
  }

  const handleSetColor = (color: string | undefined) => {
    if (!contextMenu.nodeId) return
    updateStyle(outlineDoc, contextMenu.nodeId, { color })
  }

  const handleSetBackground = (color: string | undefined) => {
    if (!contextMenu.nodeId) return
    updateStyle(outlineDoc, contextMenu.nodeId, { backgroundColor: color })
  }

  const handleApplyPreset = (preset: {
    color: string
    backgroundColor: string
  }) => {
    if (!contextMenu.nodeId) return
    updateStyle(outlineDoc, contextMenu.nodeId, {
      color: preset.color,
      backgroundColor: preset.backgroundColor,
    })
    setContextMenu((prev) => ({ ...prev, open: false }))
    parentRef.current?.focus()
  }

  const handleSelectIcon = (name: string) => {
    if (!iconPicker.nodeId) return
    updateStyle(outlineDoc, iconPicker.nodeId, { icon: name })
    setIconPicker((prev) => ({ ...prev, open: false }))
  }

  const handleRemoveIcon = () => {
    if (!iconPicker.nodeId) return
    updateStyle(outlineDoc, iconPicker.nodeId, { icon: undefined, iconColor: undefined })
    setIconPicker((prev) => ({ ...prev, open: false }))
  }

  const handleSelectIconColor = (color: string) => {
    if (!iconPicker.nodeId) return
    updateStyle(outlineDoc, iconPicker.nodeId, { iconColor: color })
  }

  const contextMenuNode = nodes.find((n) => n.id === contextMenu.nodeId)
  const iconPickerNode = nodes.find((n) => n.id === iconPicker.nodeId)

  if (nodes.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.emptyState}>
          <button
            onClick={() => {
              const id = createNode(outlineDoc, null)
              setActiveId(id)
              setMode("insert")
            }}
            className={styles.startButton}
          >
            <Trans>Start outlining</Trans>
          </button>
        </div>
      </div>
    )
  }

  // Drop indicator position (line for before/after; null for "into" which uses row highlight)
  const dropIndicatorY = (() => {
    const dt = dragState?.dropTarget
    if (!dt || dt.position === "into") return null
    const vItems = rowVirtualizer.getVirtualItems()
    const vItem = vItems.find((v) => displayNodes[v.index]?.id === dt.nodeId)
    if (!vItem) return null
    return dt.position === "before" ? vItem.start : vItem.start + vItem.size
  })()

  const dropIntoNodeId =
    dragState?.dropTarget?.position === "into"
      ? dragState.dropTarget.nodeId
      : null

  // Drag overlay
  const draggingNode = dragState
    ? displayNodes.find((n) => n.id === dragState.draggingId)
    : null
  const containerRect = dragState ? parentRef.current?.getBoundingClientRect() : null

  return (
    <div className={styles.wrapper}>
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          placeholder={t`Filter...`}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilterText("")
              e.preventDefault()
            }
            e.stopPropagation()
          }}
        />
        {filterText && (
          <button
            className={styles.clearBtn}
            onClick={() => setFilterText("")}
          >
            ×
          </button>
        )}
      </div>
      <div
        ref={(el) => {
          parentRef.current = el
          if (containerRef) (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        }}
        className={styles.container}
        onKeyDown={(e) => {
          if (filterText) {
            if (e.key === "Escape") {
              setFilterText("")
              e.preventDefault()
            }
            return
          }
          handleKeyDown(e)
        }}
        onPaste={handlePasteEvent}
        tabIndex={0}
      >
        {displayNodes.length === 0 && filterText ? (
          <div className={styles.noResults}>{t`No results for "${filterText}"`}</div>
        ) : (
          <div
            className={styles.virtualList}
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const node = displayNodes[virtualRow.index]
              return (
                <div
                  key={node.id}
                  className={
                    node.id === dropIntoNodeId
                      ? `${styles.virtualRow} ${styles.dropInto}`
                      : styles.virtualRow
                  }
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <OutlineRow
                    node={node}
                    isActive={node.id === activeId}
                    mode={mode}
                    onRowClick={(id) => setActiveId(id)}
                    onRowDblClick={(id) => {
                      setActiveId(id)
                      setMode("insert")
                    }}
                    onRowContextMenu={handleContextMenu}
                    onUpdateTitle={updateTitle}
                    onBulletClick={handleBulletClick}
                    onToggleCollapse={(id) => toggleCollapse(outlineDoc, id)}
                    onDragHandlePointerDown={startDrag}
                    isDragging={dragState?.subtreeIds.has(node.id)}
                  />
                </div>
              )
            })}
            {dropIndicatorY !== null && (
              <div
                className={styles.dropIndicator}
                style={{ top: dropIndicatorY - 1 }}
              />
            )}
          </div>
        )}
      </div>

      {draggingNode && containerRect && (
        <div
          className={styles.dragOverlay}
          style={{
            top: dragState!.mouseY - 16,
            left: containerRect.left,
            width: containerRect.width,
          }}
        >
          <span>{draggingNode.title || t`Untitled`}</span>
        </div>
      )}

      <Popover
        open={contextMenu.open}
        onOpenChange={(open) => setContextMenu((prev) => ({ ...prev, open }))}
        virtualRef={contextMenuVirtualRef}
        placement="right-start"
      >
        {contextMenuNode && (
          <FormatPanel
            nodeStyle={contextMenuNode.style}
            onToggle={handleToggleFormat}
            onClearFormat={handleClearFormat}
            onSetColor={handleSetColor}
            onSetBackground={handleSetBackground}
            onApplyPreset={handleApplyPreset}
            templates={templates}
            defaultChildTemplateId={contextMenuNode.data?.defaultChildTemplateId as string | undefined}
            onSetDefaultChildTemplate={(id) => {
              if (contextMenu.nodeId)
                setDefaultChildTemplate(outlineDoc, contextMenu.nodeId, id)
            }}
          />
        )}
      </Popover>

      <Popover
        open={iconPicker.open}
        onOpenChange={(open) => setIconPicker((prev) => ({ ...prev, open }))}
        virtualRef={iconPickerVirtualRef}
        placement="right-start"
      >
        {iconPickerNode && (
          <IconPickerPanel
            nodeStyle={iconPickerNode.style}
            onSelectIcon={handleSelectIcon}
            onRemoveIcon={handleRemoveIcon}
            onSelectColor={handleSelectIconColor}
          />
        )}
      </Popover>
    </div>
  )
}
