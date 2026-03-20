import { createPortal } from "react-dom"
import { Eraser } from "lucide-react"
import type { MarkType } from "@milkdown/prose/model"
import { HIGHLIGHT_COLORS, HighlightSelectionInfo } from "../editor/highlightPlugin"
import styles from "./HighlightToolbar.module.css"

interface HighlightToolbarProps {
  info: HighlightSelectionInfo
  highlightMarkTypeRef: React.MutableRefObject<MarkType | null>
}

export function HighlightToolbar({ info, highlightMarkTypeRef }: HighlightToolbarProps) {
  const { coords, from, to, activeColor, view } = info

  const applyColor = (color: string) => {
    const markType = highlightMarkTypeRef.current
    if (!markType) return
    const { state } = view
    if (activeColor === color) {
      // Clicking the active color removes the mark
      view.dispatch(state.tr.removeMark(from, to, markType))
    } else {
      view.dispatch(state.tr.addMark(from, to, markType.create({ color })))
    }
    view.focus()
  }

  const eraseAll = () => {
    const markType = highlightMarkTypeRef.current
    if (!markType) return
    view.dispatch(view.state.tr.removeMark(from, to, markType))
    view.focus()
  }

  return createPortal(
    <div
      className={styles.toolbar}
      style={{ left: coords.left, top: coords.top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map(({ key, label }) => (
        <button
          key={key}
          className={`${styles.swatch} ${activeColor === key ? styles.swatchActive : ""}`}
          style={{ backgroundColor: `var(--highlight-${key})` }}
          title={label}
          onClick={() => applyColor(key)}
          aria-label={`Highlight ${label}`}
        />
      ))}
      <div className={styles.divider} />
      <button
        className={styles.eraseBtn}
        title="Remove highlight"
        onClick={eraseAll}
        aria-label="Remove highlight"
      >
        <Eraser size={13} />
      </button>
    </div>,
    document.body,
  )
}
