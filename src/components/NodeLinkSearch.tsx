import { createPortal } from "react-dom"
import type { OutletNode } from "../types"
import styles from "./NodeLinkSearch.module.css"

export const NodeLinkSearch = ({
  coords,
  nodes,
  selectedIdx,
  onSelect,
}: {
  coords: { left: number; top: number }
  nodes: OutletNode[]
  selectedIdx: number
  onSelect: (node: OutletNode) => void
}) =>
  createPortal(
    <div className={styles.dropdown} style={{ left: coords.left, top: coords.top }}>
      {nodes.length === 0 ? (
        <div className={styles.empty}>No matches</div>
      ) : (
        nodes.map((node, i) => (
          <div
            key={node.id}
            className={`${styles.item}${i === selectedIdx ? ` ${styles.active}` : ""}`}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(node)
            }}
          >
            {node.title || <span className={styles.untitled}>Untitled</span>}
          </div>
        ))
      )}
    </div>,
    document.body,
  )
