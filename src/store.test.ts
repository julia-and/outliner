// Must be the very first import to install fake IndexedDB before Dexie loads.
import "fake-indexeddb/auto"

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as Y from "yjs"

// ---------------------------------------------------------------------------
// Mock addons that require real browser/network APIs.
// dexie-cloud-addon needs this.cloud.configure() to exist.
// y-dexie handles Y.Doc table columns — mocked as no-op so Dexie stays plain.
// ---------------------------------------------------------------------------

vi.mock("dexie-cloud-addon", () => ({
  default: (db: any) => {
    db.cloud = { configure: vi.fn() }
  },
}))

vi.mock("y-dexie", () => ({
  default: vi.fn(), // no-op addon — columns stored as plain objects
  DexieYProvider: {
    load: vi.fn(() => ({ whenLoaded: Promise.resolve() })),
    release: vi.fn(),
  },
}))

import {
  getNodesMap,
  createNode,
  deleteNode,
  addSibling,
  addChild,
  addRootSibling,
  moveNode,
  indentNode,
  outdentNode,
  updateTitle,
  updateStyle,
  toggleCollapse,
  moveNodeBefore,
  moveNodeAfter,
  moveNodeAsLastChild,
  pasteSubtree,
  getAncestors,
  setDefaultChildTemplate,
} from "./store"
import type { ClipboardPayload } from "./utils/clipboard"

// ---------------------------------------------------------------------------
// Helper: create a Y.Doc and populate the nodesMap in one call.
// ---------------------------------------------------------------------------

function makeDoc(
  nodes: Array<{
    id: string
    parentId?: string | null
    title?: string
    order?: number
    collapsed?: boolean
    style?: Record<string, unknown>
    data?: Record<string, unknown>
  }> = [],
): Y.Doc {
  const doc = new Y.Doc()
  const nodesMap = getNodesMap(doc)
  for (const n of nodes) {
    nodesMap.set(n.id, {
      parentId: n.parentId ?? null,
      title: n.title ?? "",
      order: n.order ?? 0,
      collapsed: n.collapsed ?? false,
      style: (n.style ?? {}) as any,
      data: (n.data ?? {}) as any,
    })
  }
  return doc
}

function getNode(doc: Y.Doc, id: string) {
  return getNodesMap(doc).get(id)
}

// Sort nodesMap entries by order within a given parent
function sortedChildren(doc: Y.Doc, parentId: string | null) {
  return Array.from(getNodesMap(doc).entries())
    .filter(([, n]) => n.parentId === parentId)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id]) => id)
}

// ---------------------------------------------------------------------------
// createNode
// ---------------------------------------------------------------------------

describe("createNode", () => {
  it("inserts a node with correct parentId and title", () => {
    const doc = makeDoc()
    const id = createNode(doc, null, "Hello")
    const node = getNode(doc, id)
    expect(node).toBeDefined()
    expect(node!.parentId).toBeNull()
    expect(node!.title).toBe("Hello")
  })

  it("defaults collapsed=false, style={}, data={}", () => {
    const doc = makeDoc()
    const id = createNode(doc, null)
    const node = getNode(doc, id)
    expect(node!.collapsed).toBe(false)
    expect(node!.style).toEqual({})
    expect(node!.data).toEqual({})
  })

  it("assigns order one greater than last sibling", () => {
    const doc = makeDoc([{ id: "a", parentId: null, order: 5 }])
    const id = createNode(doc, null)
    expect(getNode(doc, id)!.order).toBe(6)
  })

  it("assigns order=0 when no siblings", () => {
    const doc = makeDoc()
    const id = createNode(doc, null)
    expect(getNode(doc, id)!.order).toBe(0)
  })

  it("respects an explicit order argument", () => {
    const doc = makeDoc()
    const id = createNode(doc, null, "", undefined, 99)
    expect(getNode(doc, id)!.order).toBe(99)
  })

  it("respects an explicit id argument", () => {
    const doc = makeDoc()
    const id = createNode(doc, null, "X", "fixed-id")
    expect(id).toBe("fixed-id")
    expect(getNode(doc, "fixed-id")).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// deleteNode
// ---------------------------------------------------------------------------

describe("deleteNode", () => {
  it("removes the node from the map", () => {
    const doc = makeDoc([{ id: "a" }])
    deleteNode(doc, "a")
    expect(getNode(doc, "a")).toBeUndefined()
  })

  it("recursively deletes children", () => {
    const doc = makeDoc([
      { id: "root" },
      { id: "child", parentId: "root" },
      { id: "grand", parentId: "child" },
    ])
    deleteNode(doc, "root")
    expect(getNode(doc, "root")).toBeUndefined()
    expect(getNode(doc, "child")).toBeUndefined()
    expect(getNode(doc, "grand")).toBeUndefined()
  })

  it("does not delete unrelated siblings", () => {
    const doc = makeDoc([
      { id: "a", parentId: null, order: 0 },
      { id: "b", parentId: null, order: 1 },
    ])
    deleteNode(doc, "a")
    expect(getNode(doc, "a")).toBeUndefined()
    expect(getNode(doc, "b")).toBeDefined()
  })

  it("is a no-op for non-existent id", () => {
    const doc = makeDoc([{ id: "a" }])
    deleteNode(doc, "missing") // should not throw
    expect(getNode(doc, "a")).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// addSibling
// ---------------------------------------------------------------------------

describe("addSibling", () => {
  it("inserts after the last sibling when no next sibling", () => {
    const doc = makeDoc([{ id: "a", order: 3 }])
    const id = addSibling(doc, "a")
    expect(getNode(doc, id)!.order).toBe(4) // prev.order + 1
  })

  it("inserts between two siblings (fractional order)", () => {
    const doc = makeDoc([
      { id: "a", order: 0 },
      { id: "b", order: 10 },
    ])
    const id = addSibling(doc, "a")
    const order = getNode(doc, id)!.order
    expect(order).toBeGreaterThan(0)
    expect(order).toBeLessThan(10)
  })

  it("new sibling has same parentId as ref", () => {
    const doc = makeDoc([
      { id: "parent" },
      { id: "child", parentId: "parent", order: 0 },
    ])
    const id = addSibling(doc, "child")
    expect(getNode(doc, id)!.parentId).toBe("parent")
  })

  it("falls back to root null parent for missing refId", () => {
    const doc = makeDoc()
    const id = addSibling(doc, "nonexistent")
    expect(getNode(doc, id)!.parentId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// addChild
// ---------------------------------------------------------------------------

describe("addChild", () => {
  it("creates a child with the given parentId", () => {
    const doc = makeDoc([{ id: "parent" }])
    const id = addChild(doc, "parent")
    expect(getNode(doc, id)!.parentId).toBe("parent")
  })

  it("uncollapses the parent", () => {
    const doc = makeDoc([{ id: "parent", collapsed: true }])
    addChild(doc, "parent")
    expect(getNode(doc, "parent")!.collapsed).toBe(false)
  })

  it("creates child as last (highest order) among siblings", () => {
    const doc = makeDoc([
      { id: "parent" },
      { id: "c1", parentId: "parent", order: 5 },
    ])
    const id = addChild(doc, "parent")
    expect(getNode(doc, id)!.order).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// addRootSibling
// ---------------------------------------------------------------------------

describe("addRootSibling", () => {
  it("creates a root-level sibling after the root ancestor", () => {
    const doc = makeDoc([
      { id: "root1", parentId: null, order: 0 },
      { id: "child", parentId: "root1", order: 0 },
    ])
    const id = addRootSibling(doc, "child")
    const node = getNode(doc, id)
    expect(node!.parentId).toBeNull()
    expect(node!.order).toBeGreaterThan(0)
  })

  it("inserts between two root nodes (fractional order)", () => {
    const doc = makeDoc([
      { id: "r1", parentId: null, order: 0 },
      { id: "r2", parentId: null, order: 10 },
    ])
    const id = addRootSibling(doc, "r1")
    const order = getNode(doc, id)!.order
    expect(order).toBeGreaterThan(0)
    expect(order).toBeLessThan(10)
  })
})

// ---------------------------------------------------------------------------
// moveNode
// ---------------------------------------------------------------------------

describe("moveNode", () => {
  it("swaps order values when moving up", () => {
    const doc = makeDoc([
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ])
    moveNode(doc, "b", "up")
    expect(getNode(doc, "b")!.order).toBe(0)
    expect(getNode(doc, "a")!.order).toBe(1)
  })

  it("swaps order values when moving down", () => {
    const doc = makeDoc([
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ])
    moveNode(doc, "a", "down")
    expect(getNode(doc, "a")!.order).toBe(1)
    expect(getNode(doc, "b")!.order).toBe(0)
  })

  it("is a no-op when moving first node up", () => {
    const doc = makeDoc([
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ])
    moveNode(doc, "a", "up")
    expect(getNode(doc, "a")!.order).toBe(0)
    expect(getNode(doc, "b")!.order).toBe(1)
  })

  it("is a no-op when moving last node down", () => {
    const doc = makeDoc([
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ])
    moveNode(doc, "b", "down")
    expect(getNode(doc, "a")!.order).toBe(0)
    expect(getNode(doc, "b")!.order).toBe(1)
  })

  it("is a no-op for non-existent node", () => {
    const doc = makeDoc()
    moveNode(doc, "missing", "up") // should not throw
  })
})

// ---------------------------------------------------------------------------
// indentNode
// ---------------------------------------------------------------------------

describe("indentNode", () => {
  it("reparents to the preceding sibling", () => {
    const doc = makeDoc([
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ])
    indentNode(doc, "b")
    expect(getNode(doc, "b")!.parentId).toBe("a")
  })

  it("uncollapses new parent", () => {
    const doc = makeDoc([
      { id: "a", order: 0, collapsed: true },
      { id: "b", order: 1 },
    ])
    indentNode(doc, "b")
    expect(getNode(doc, "a")!.collapsed).toBe(false)
  })

  it("appends as last child of new parent", () => {
    const doc = makeDoc([
      { id: "a", order: 0 },
      { id: "existing", parentId: "a", order: 5 },
      { id: "b", order: 1 },
    ])
    indentNode(doc, "b")
    expect(getNode(doc, "b")!.order).toBe(6) // after existing child
  })

  it("is a no-op when node is first sibling (no preceding sibling)", () => {
    const doc = makeDoc([{ id: "a", order: 0 }])
    indentNode(doc, "a")
    expect(getNode(doc, "a")!.parentId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// outdentNode
// ---------------------------------------------------------------------------

describe("outdentNode", () => {
  it("moves child to grandparent level after parent", () => {
    const doc = makeDoc([
      { id: "root", parentId: null, order: 0 },
      { id: "child", parentId: "root", order: 0 },
    ])
    outdentNode(doc, "child")
    expect(getNode(doc, "child")!.parentId).toBeNull()
    expect(getNode(doc, "child")!.order).toBeGreaterThan(0)
  })

  it("is a no-op for a root-level node", () => {
    const doc = makeDoc([{ id: "root", parentId: null }])
    outdentNode(doc, "root")
    expect(getNode(doc, "root")!.parentId).toBeNull()
  })

  it("places outdented node between parent and parent's next sibling (fractional order)", () => {
    const doc = makeDoc([
      { id: "r1", parentId: null, order: 0 },
      { id: "r2", parentId: null, order: 10 },
      { id: "child", parentId: "r1", order: 0 },
    ])
    outdentNode(doc, "child")
    const order = getNode(doc, "child")!.order
    expect(order).toBeGreaterThan(0)
    expect(order).toBeLessThan(10)
  })
})

// ---------------------------------------------------------------------------
// updateTitle / updateStyle / toggleCollapse
// ---------------------------------------------------------------------------

describe("updateTitle", () => {
  it("updates the title field", () => {
    const doc = makeDoc([{ id: "a", title: "Old" }])
    updateTitle(doc, "a", "New")
    expect(getNode(doc, "a")!.title).toBe("New")
  })

  it("is a no-op for missing node", () => {
    const doc = makeDoc()
    updateTitle(doc, "missing", "X") // should not throw
  })
})

describe("updateStyle", () => {
  it("merges new style properties", () => {
    const doc = makeDoc([{ id: "a", style: { bold: true } as any }])
    updateStyle(doc, "a", { italic: true })
    const style = getNode(doc, "a")!.style
    expect(style.bold).toBe(true)
    expect(style.italic).toBe(true)
  })

  it("removes properties set to undefined", () => {
    const doc = makeDoc([{ id: "a", style: { bold: true } as any }])
    updateStyle(doc, "a", { bold: undefined })
    expect(getNode(doc, "a")!.style.bold).toBeUndefined()
  })

  it("is a no-op for missing node", () => {
    const doc = makeDoc()
    updateStyle(doc, "missing", { bold: true }) // should not throw
  })
})

describe("toggleCollapse", () => {
  it("sets collapsed=true on an expanded node", () => {
    const doc = makeDoc([{ id: "a", collapsed: false }])
    toggleCollapse(doc, "a")
    expect(getNode(doc, "a")!.collapsed).toBe(true)
  })

  it("sets collapsed=false on a collapsed node", () => {
    const doc = makeDoc([{ id: "a", collapsed: true }])
    toggleCollapse(doc, "a")
    expect(getNode(doc, "a")!.collapsed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// moveNodeBefore / moveNodeAfter / moveNodeAsLastChild
// ---------------------------------------------------------------------------

describe("moveNodeBefore", () => {
  it("places node before target using fractional order", () => {
    const doc = makeDoc([
      { id: "prev", order: 0 },
      { id: "target", order: 10 },
      { id: "mover", order: 20 },
    ])
    moveNodeBefore(doc, "mover", "target")
    const order = getNode(doc, "mover")!.order
    expect(order).toBeGreaterThan(0)
    expect(order).toBeLessThan(10)
  })

  it("places node before first target (no prev sibling) → order < target", () => {
    const doc = makeDoc([
      { id: "target", order: 5 },
      { id: "mover", order: 20 },
    ])
    moveNodeBefore(doc, "mover", "target")
    expect(getNode(doc, "mover")!.order).toBeLessThan(5)
  })

  it("adopts target's parentId", () => {
    const doc = makeDoc([
      { id: "parent" },
      { id: "child", parentId: "parent", order: 0 },
      { id: "mover", parentId: null, order: 100 },
    ])
    moveNodeBefore(doc, "mover", "child")
    expect(getNode(doc, "mover")!.parentId).toBe("parent")
  })
})

describe("moveNodeAfter", () => {
  it("places node after target using fractional order", () => {
    const doc = makeDoc([
      { id: "target", order: 0 },
      { id: "next", order: 10 },
      { id: "mover", order: 20 },
    ])
    moveNodeAfter(doc, "mover", "target")
    const order = getNode(doc, "mover")!.order
    expect(order).toBeGreaterThan(0)
    expect(order).toBeLessThan(10)
  })

  it("places node after last target (no next sibling) → order > target", () => {
    const doc = makeDoc([
      { id: "target", order: 5 },
      { id: "mover", order: 0 },
    ])
    moveNodeAfter(doc, "mover", "target")
    expect(getNode(doc, "mover")!.order).toBeGreaterThan(5)
  })
})

describe("moveNodeAsLastChild", () => {
  it("appends as last child of target parent", () => {
    const doc = makeDoc([
      { id: "parent" },
      { id: "existing", parentId: "parent", order: 5 },
      { id: "mover", parentId: null, order: 0 },
    ])
    moveNodeAsLastChild(doc, "mover", "parent")
    const mover = getNode(doc, "mover")!
    expect(mover.parentId).toBe("parent")
    expect(mover.order).toBeGreaterThan(5)
  })

  it("sets order=0 when target parent has no existing children", () => {
    const doc = makeDoc([
      { id: "parent" },
      { id: "mover", parentId: null, order: 10 },
    ])
    moveNodeAsLastChild(doc, "mover", "parent")
    expect(getNode(doc, "mover")!.order).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// pasteSubtree
// ---------------------------------------------------------------------------

describe("pasteSubtree", () => {
  it("returns empty array for empty payload", () => {
    const doc = makeDoc([{ id: "anchor", order: 0 }])
    const result = pasteSubtree(doc, { nodes: [] }, null, "anchor")
    expect(result).toEqual([])
  })

  it("returns empty array for non-existent afterNodeId", () => {
    const payload: ClipboardPayload = { nodes: [{ title: "X", style: {}, children: [] }] }
    const doc = makeDoc()
    expect(pasteSubtree(doc, payload, null, "missing")).toEqual([])
  })

  it("inserts single node after anchor when no next sibling", () => {
    const doc = makeDoc([{ id: "anchor", order: 5 }])
    const payload: ClipboardPayload = { nodes: [{ title: "Pasted", style: {}, children: [] }] }
    const ids = pasteSubtree(doc, payload, null, "anchor")
    expect(ids.length).toBe(1)
    const node = getNode(doc, ids[0])!
    expect(node.title).toBe("Pasted")
    expect(node.order).toBeGreaterThan(5)
    expect(node.parentId).toBeNull()
  })

  it("inserts multiple nodes with orders between anchor and next sibling", () => {
    const doc = makeDoc([
      { id: "anchor", order: 0 },
      { id: "next", order: 10 },
    ])
    const payload: ClipboardPayload = {
      nodes: [
        { title: "P1", style: {}, children: [] },
        { title: "P2", style: {}, children: [] },
      ],
    }
    const ids = pasteSubtree(doc, payload, null, "anchor")
    expect(ids.length).toBe(2)
    const o1 = getNode(doc, ids[0])!.order
    const o2 = getNode(doc, ids[1])!.order
    expect(o1).toBeGreaterThan(0)
    expect(o1).toBeLessThan(10)
    expect(o2).toBeGreaterThan(o1)
    expect(o2).toBeLessThan(10)
  })

  it("creates child nodes recursively", () => {
    const doc = makeDoc([{ id: "anchor", order: 0 }])
    const payload: ClipboardPayload = {
      nodes: [
        {
          title: "Root",
          style: {},
          children: [{ title: "Child", style: {}, children: [] }],
        },
      ],
    }
    const ids = pasteSubtree(doc, payload, null, "anchor")
    const rootId = ids[0]
    const children = sortedChildren(doc, rootId)
    expect(children.length).toBe(1)
    expect(getNode(doc, children[0])!.title).toBe("Child")
  })

  it("returns only root-level pasted node IDs", () => {
    const doc = makeDoc([{ id: "anchor", order: 0 }])
    const payload: ClipboardPayload = {
      nodes: [
        {
          title: "Root",
          style: {},
          children: [{ title: "Child", style: {}, children: [] }],
        },
      ],
    }
    const ids = pasteSubtree(doc, payload, null, "anchor")
    expect(ids.length).toBe(1) // only the root, not the child
  })
})

// ---------------------------------------------------------------------------
// getAncestors
// ---------------------------------------------------------------------------

describe("getAncestors", () => {
  it("returns empty array for a root node", () => {
    const doc = makeDoc([{ id: "root", title: "Root" }])
    expect(getAncestors(getNodesMap(doc), "root")).toEqual([])
  })

  it("returns one ancestor for a direct child of root", () => {
    const doc = makeDoc([
      { id: "root", title: "Root" },
      { id: "child", parentId: "root", title: "Child" },
    ])
    const ancestors = getAncestors(getNodesMap(doc), "child")
    expect(ancestors).toEqual([{ id: "root", title: "Root" }])
  })

  it("returns full path for deeply nested node", () => {
    const doc = makeDoc([
      { id: "a", title: "A" },
      { id: "b", parentId: "a", title: "B" },
      { id: "c", parentId: "b", title: "C" },
    ])
    const ancestors = getAncestors(getNodesMap(doc), "c")
    expect(ancestors.map((a) => a.id)).toEqual(["a", "b"])
  })

  it("returns empty array for non-existent id", () => {
    const doc = makeDoc()
    expect(getAncestors(getNodesMap(doc), "missing")).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// setDefaultChildTemplate
// ---------------------------------------------------------------------------

describe("setDefaultChildTemplate", () => {
  it("stores templateId in node data", () => {
    const doc = makeDoc([{ id: "node" }])
    setDefaultChildTemplate(doc, "node", "tpl-abc")
    expect(getNode(doc, "node")!.data.defaultChildTemplateId).toBe("tpl-abc")
  })

  it("removes templateId from data when set to null", () => {
    const doc = makeDoc([{ id: "node", data: { defaultChildTemplateId: "tpl-abc" } }])
    setDefaultChildTemplate(doc, "node", null)
    expect(getNode(doc, "node")!.data.defaultChildTemplateId).toBeUndefined()
  })

  it("is a no-op for non-existent node", () => {
    const doc = makeDoc()
    setDefaultChildTemplate(doc, "missing", "tpl") // should not throw
  })

  it("preserves other data fields when setting template", () => {
    const doc = makeDoc([{ id: "node", data: { foo: "bar" } }])
    setDefaultChildTemplate(doc, "node", "tpl-xyz")
    const data = getNode(doc, "node")!.data
    expect(data.foo).toBe("bar")
    expect(data.defaultChildTemplateId).toBe("tpl-xyz")
  })

  it("preserves other data fields when clearing template", () => {
    const doc = makeDoc([{ id: "node", data: { foo: "bar", defaultChildTemplateId: "tpl" } }])
    setDefaultChildTemplate(doc, "node", null)
    const data = getNode(doc, "node")!.data
    expect(data.foo).toBe("bar")
    expect(data.defaultChildTemplateId).toBeUndefined()
  })
})
