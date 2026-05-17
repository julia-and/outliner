import { describe, it, expect, vi } from "vitest"
import * as Y from "yjs"
import { dispatchOutlineKey, OutlineKeyContext } from "./outlineKeyboard"
import { OutletNode, NodeYRecord } from "../types"

function makeKeyEvent(
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ...init })
}

function makeOutletNode(
  id: string,
  partial: Partial<OutletNode> = {},
): OutletNode {
  return {
    id,
    parentId: null,
    title: id,
    depth: 0,
    style: {},
    collapsed: false,
    hasChildren: false,
    data: {},
    ...partial,
  }
}

function makeCtx(over: Partial<OutlineKeyContext>): OutlineKeyContext {
  return {
    e: makeKeyEvent("ArrowDown"),
    doc: new Y.Doc(),
    nodes: [],
    nodeMap: new Map<string, NodeYRecord>(),
    activeId: null,
    idx: -1,
    setActive: vi.fn(),
    setMode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    originalTitleRef: { current: null },
    ...over,
  }
}

describe("dispatchOutlineKey — nav mode", () => {
  it("nav.down advances to the next visible node", () => {
    const setActive = vi.fn()
    const nodes = [makeOutletNode("a"), makeOutletNode("b"), makeOutletNode("c")]
    dispatchOutlineKey(
      makeCtx({
        e: makeKeyEvent("ArrowDown"),
        nodes,
        activeId: "a",
        idx: 0,
        setActive,
      }),
      "nav",
    )
    expect(setActive).toHaveBeenCalledExactlyOnceWith("b")
  })

  it("nav.up at the top is a no-op (no setActive call)", () => {
    const setActive = vi.fn()
    const nodes = [makeOutletNode("a"), makeOutletNode("b")]
    dispatchOutlineKey(
      makeCtx({
        e: makeKeyEvent("ArrowUp"),
        nodes,
        activeId: "a",
        idx: 0,
        setActive,
      }),
      "nav",
    )
    expect(setActive).not.toHaveBeenCalled()
  })

  it("Tab indents the active node via the hardcoded alias", () => {
    // Indent requires the node + its preceding sibling to exist in the doc.
    const doc = new Y.Doc()
    const map = doc.getMap<NodeYRecord>("nodes")
    map.set("a", {
      parentId: null,
      title: "a",
      order: 0,
      collapsed: false,
      style: {},
      data: {},
    })
    map.set("b", {
      parentId: null,
      title: "b",
      order: 1,
      collapsed: false,
      style: {},
      data: {},
    })

    dispatchOutlineKey(
      makeCtx({
        e: makeKeyEvent("Tab"),
        doc,
        nodes: [makeOutletNode("a"), makeOutletNode("b")],
        activeId: "b",
        idx: 1,
      }),
      "nav",
    )

    expect(map.get("b")?.parentId).toBe("a")
  })
})
