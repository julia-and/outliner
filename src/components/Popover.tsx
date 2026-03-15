import React, { useRef } from "react"
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
  FloatingArrow,
  Placement,
  VirtualElement,
} from "@floating-ui/react"
import styles from "./Popover.module.css"

interface PopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  trigger?: React.ReactNode
  virtualRef?: VirtualElement
  placement?: Placement
  offset?: number
}

export function Popover({
  open,
  onOpenChange,
  children,
  trigger,
  virtualRef,
  placement = "bottom-start",
  offset: offsetVal = 4,
}: PopoverProps) {
  const arrowRef = useRef(null)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(offsetVal),
      flip(),
      shift({ padding: 5 }),
      arrow({ element: arrowRef }),
    ],
  })

  // If virtualRef is provided, update reference
  React.useEffect(() => {
    if (virtualRef) {
      refs.setPositionReference(virtualRef)
    }
  }, [virtualRef, refs])

  const click = useClick(context, { enabled: !!trigger })
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ])

  return (
    <>
      {trigger && (
        <div
          ref={refs.setReference}
          className={styles.trigger}
          {...getReferenceProps()}
        >
          {trigger}
        </div>
      )}
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className={styles.content}
            style={{
              ...floatingStyles,
            }}
            {...getFloatingProps()}
          >
            <FloatingArrow
              ref={arrowRef}
              context={context}
              fill="white"
              stroke="#ddd"
              strokeWidth={1}
            />
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
