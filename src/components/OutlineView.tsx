import React, { useRef, useState, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { OutlineRow } from "./OutlineRow"
import { updateStyle, createNode } from "../store"
import { VirtualElement } from "@floating-ui/react"
import styles from "./OutlineView.module.css"
import { OutletNode } from "../types"
import { Popover } from "./Popover"
import { FormatPanel } from "./FormatPanel"
import { IconPickerPanel } from "./IconPickerPanel"

interface OutlineViewProps {
  nodes: OutletNode[]
  activeId: string | null
  mode: "nav" | "insert"
  setActiveId: (id: string) => void
  setMode: (mode: "nav" | "insert") => void
  updateTitle: (id: string, title: string) => void
  handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => void
}

export const OutlineView: React.FC<OutlineViewProps> = ({
  nodes,
  activeId,
  mode,
  setActiveId,
  setMode,
  updateTitle,
  handleKeyDown,
}) => {
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

  const displayNodes = filterText.trim()
    ? nodes.filter((n) =>
        n.title.toLowerCase().includes(filterText.toLowerCase()),
      )
    : nodes

  const rowVirtualizer = useVirtualizer({
    count: displayNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 5,
  })

  // Focus management
  useEffect(() => {
    parentRef.current?.focus()
  }, [])

  useEffect(() => {
    if (mode === "nav") {
      parentRef.current?.focus({ preventScroll: true })
    }
  }, [mode])

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

  // Format panel handlers
  const handleToggleFormat = (key: "bold" | "italic" | "strikethrough") => {
    if (!contextMenu.nodeId) return
    const node = nodes.find((n) => n.id === contextMenu.nodeId)
    if (node) {
      updateStyle(contextMenu.nodeId, { [key]: !node.style[key] })
    }
  }

  const handleClearFormat = () => {
    if (!contextMenu.nodeId) return
    updateStyle(contextMenu.nodeId, {
      bold: undefined,
      italic: undefined,
      strikethrough: undefined,
      color: undefined,
      backgroundColor: undefined,
    })
  }

  const handleSetColor = (color: string | undefined) => {
    if (!contextMenu.nodeId) return
    updateStyle(contextMenu.nodeId, { color })
  }

  const handleSetBackground = (color: string | undefined) => {
    if (!contextMenu.nodeId) return
    updateStyle(contextMenu.nodeId, { backgroundColor: color })
  }

  const handleApplyPreset = (preset: {
    color: string
    backgroundColor: string
  }) => {
    if (!contextMenu.nodeId) return
    updateStyle(contextMenu.nodeId, {
      color: preset.color,
      backgroundColor: preset.backgroundColor,
    })
    setContextMenu((prev) => ({ ...prev, open: false }))
    parentRef.current?.focus()
  }

  // Icon picker handlers
  const handleSelectIcon = (name: string) => {
    if (!iconPicker.nodeId) return
    updateStyle(iconPicker.nodeId, { icon: name })
    setIconPicker((prev) => ({ ...prev, open: false }))
  }

  const handleRemoveIcon = () => {
    if (!iconPicker.nodeId) return
    updateStyle(iconPicker.nodeId, { icon: undefined, iconColor: undefined })
    setIconPicker((prev) => ({ ...prev, open: false }))
  }

  const handleSelectIconColor = (color: string) => {
    if (!iconPicker.nodeId) return
    updateStyle(iconPicker.nodeId, { iconColor: color })
  }

  const contextMenuNode = nodes.find((n) => n.id === contextMenu.nodeId)
  const iconPickerNode = nodes.find((n) => n.id === iconPicker.nodeId)

  if (nodes.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.emptyState}>
          <button
            onClick={() => {
              createNode(null).then((id) => {
                setActiveId(id)
                setMode("insert")
              })
            }}
            className={styles.startButton}
          >
            Start outlining
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          placeholder="Filter..."
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
        ref={parentRef}
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
        tabIndex={0}
      >
        {displayNodes.length === 0 && filterText ? (
          <div className={styles.noResults}>No results for "{filterText}"</div>
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
                  className={styles.virtualRow}
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
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

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
