import React, { useMemo } from "react"
import { useOutline } from "./hooks/useOutline"
import { SplitLayout } from "./components/SplitLayout"
import { OutlineView } from "./components/OutlineView"
import { EditorView } from "./components/EditorView"
import { getAncestors } from "./store"

export const App: React.FC = () => {
  const outline = useOutline()
  const activeNode =
    outline.nodes.find((n) => n.id === outline.activeId) ?? null

  const ancestors = useMemo(
    () =>
      outline.activeId ? getAncestors(outline.nodeMap, outline.activeId) : [],
    [outline.nodeMap, outline.activeId],
  )

  return (
    <SplitLayout
      left={
        <OutlineView
          nodes={outline.nodes}
          activeId={outline.activeId}
          mode={outline.mode}
          setActiveId={outline.setActiveId}
          setMode={outline.setMode}
          updateTitle={outline.updateTitle}
          handleKeyDown={outline.handleKeyDown}
        />
      }
      right={
        <EditorView
          activeId={outline.activeId}
          activeNode={activeNode}
          ancestors={ancestors}
          updateTitle={outline.updateTitle}
          onNavigate={outline.setActiveId}
        />
      }
    />
  )
}
