import { createPortal } from "react-dom"
import { useEffect, useRef } from "react"
import { CALLOUT_COLORS, CalloutPickerInfo } from "../editor/calloutPlugin"
import styles from "./CalloutColorPicker.module.css"

interface CalloutColorPickerProps {
  info: CalloutPickerInfo
  onClose: () => void
}

export function CalloutColorPicker({ info, onClose }: CalloutColorPickerProps) {
  const { anchorRect, activeColor, nodePos, view } = info
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    // setTimeout defers the listener until after the mousedown that opened
    // the picker has finished bubbling, preventing an immediate self-close.
    let handler: ((e: MouseEvent) => void) | null = null
    const id = setTimeout(() => {
      handler = () => onCloseRef.current()
      document.addEventListener("mousedown", handler)
    }, 0)
    return () => {
      clearTimeout(id)
      if (handler) document.removeEventListener("mousedown", handler)
    }
  }, []) // runs once on mount

  const applyColor = (color: string) => {
    const { state, dispatch } = view
    dispatch(state.tr.setNodeMarkup(nodePos, undefined, { color }))
    view.focus()
    onClose()
  }

  return createPortal(
    <div
      className={styles.picker}
      style={{ left: anchorRect.left, top: anchorRect.bottom + 6 }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {CALLOUT_COLORS.map(({ key, label }) => (
        <button
          key={key}
          className={`${styles.swatch} ${activeColor === key ? styles.swatchActive : ""}`}
          style={{ backgroundColor: `var(--callout-${key}-accent)` }}
          title={label}
          onClick={() => applyColor(key)}
          aria-label={`${label} callout`}
        />
      ))}
    </div>,
    document.body,
  )
}
