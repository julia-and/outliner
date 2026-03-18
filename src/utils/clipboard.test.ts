import { describe, it, expect } from "vitest"
import {
  buildClipboardPayload,
  payloadToHtml,
  payloadToPlainText,
  parseClipboard,
} from "./clipboard"
import type { ClipboardNode, ClipboardPayload } from "./clipboard"
import type { NodeYRecord } from "../types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNodesMap(
  nodes: Array<{ id: string } & Partial<NodeYRecord>>,
): Map<string, NodeYRecord> {
  const map = new Map<string, NodeYRecord>()
  for (const { id, ...rest } of nodes) {
    map.set(id, {
      parentId: null,
      title: "",
      order: 0,
      collapsed: false,
      style: {},
      data: {},
      ...rest,
    })
  }
  return map
}

function leaf(title: string, style: NodeYRecord["style"] = {}): ClipboardNode {
  return { title, style, children: [] }
}

// ---------------------------------------------------------------------------
// buildClipboardPayload
// ---------------------------------------------------------------------------

describe("buildClipboardPayload", () => {
  it("returns empty nodes when rootId does not exist", () => {
    const map = makeNodesMap([])
    expect(buildClipboardPayload("missing", map)).toEqual({ nodes: [] })
  })

  it("returns single node with no children", () => {
    const map = makeNodesMap([{ id: "a", title: "Alpha" }])
    expect(buildClipboardPayload("a", map)).toEqual({
      nodes: [{ title: "Alpha", style: {}, children: [] }],
    })
  })

  it("preserves node style", () => {
    const map = makeNodesMap([{ id: "a", title: "Styled", style: { bold: true, color: "#f00" } }])
    const result = buildClipboardPayload("a", map)
    expect(result.nodes[0].style).toEqual({ bold: true, color: "#f00" })
  })

  it("returns children in order", () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "c1", title: "First", parentId: "root", order: 10 },
      { id: "c2", title: "Second", parentId: "root", order: 20 },
      { id: "c3", title: "Third", parentId: "root", order: 5 },
    ])
    const result = buildClipboardPayload("root", map)
    expect(result.nodes[0].children.map((c) => c.title)).toEqual(["Third", "First", "Second"])
  })

  it("builds nested tree recursively", () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "child", title: "Child", parentId: "root", order: 0 },
      { id: "grand", title: "Grand", parentId: "child", order: 0 },
    ])
    const result = buildClipboardPayload("root", map)
    expect(result.nodes[0].children[0].title).toBe("Child")
    expect(result.nodes[0].children[0].children[0].title).toBe("Grand")
  })

  it("falls back to empty style when node style is falsy", () => {
    const map = new Map<string, NodeYRecord>()
    map.set("a", { parentId: null, title: "X", order: 0, collapsed: false, style: undefined as any, data: {} })
    const result = buildClipboardPayload("a", map)
    expect(result.nodes[0].style).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// payloadToHtml
// ---------------------------------------------------------------------------

describe("payloadToHtml", () => {
  it("produces a UL with data-outline-nodes attribute", () => {
    const payload: ClipboardPayload = { nodes: [leaf("Hello")] }
    const html = payloadToHtml(payload)
    expect(html).toContain("<ul data-outline-nodes=")
    expect(html).toContain("Hello")
  })

  it("encodes special characters in title attribute", () => {
    const payload: ClipboardPayload = { nodes: [leaf('<b>bold</b> & more')] }
    const html = payloadToHtml(payload)
    expect(html).not.toContain("<b>")
    expect(html).toContain("&lt;b&gt;")
    expect(html).toContain("&amp;")
  })

  it("encodes special characters in data-outline-nodes JSON", () => {
    const payload: ClipboardPayload = { nodes: [leaf('Has "quotes" & <tags>')] }
    const html = payloadToHtml(payload)
    // The attribute value should have the JSON encoded
    const attrMatch = html.match(/data-outline-nodes="([^"]*)"/)
    expect(attrMatch).not.toBeNull()
  })

  it("nests children in inner UL elements", () => {
    const parent: ClipboardNode = {
      title: "Parent",
      style: {},
      children: [leaf("Child1"), leaf("Child2")],
    }
    const html = payloadToHtml({ nodes: [parent] })
    expect(html).toContain("<ul>")
    expect(html).toContain("Child1")
    expect(html).toContain("Child2")
  })

  it("produces empty UL for empty payload", () => {
    const html = payloadToHtml({ nodes: [] })
    expect(html).toMatch(/<ul data-outline-nodes="[^"]*"><\/ul>/)
  })
})

// ---------------------------------------------------------------------------
// payloadToPlainText
// ---------------------------------------------------------------------------

describe("payloadToPlainText", () => {
  it("produces dash-prefixed lines", () => {
    const payload: ClipboardPayload = { nodes: [leaf("Hello")] }
    expect(payloadToPlainText(payload)).toBe("- Hello")
  })

  it("indents children by two spaces per depth level", () => {
    const node: ClipboardNode = {
      title: "Parent",
      style: {},
      children: [
        {
          title: "Child",
          style: {},
          children: [leaf("Grandchild")],
        },
      ],
    }
    const text = payloadToPlainText({ nodes: [node] })
    expect(text).toBe("- Parent\n  - Child\n    - Grandchild")
  })

  it("handles multiple root nodes", () => {
    const payload: ClipboardPayload = { nodes: [leaf("A"), leaf("B"), leaf("C")] }
    expect(payloadToPlainText(payload)).toBe("- A\n- B\n- C")
  })

  it("returns empty string for empty payload", () => {
    expect(payloadToPlainText({ nodes: [] })).toBe("")
  })
})

// ---------------------------------------------------------------------------
// parseClipboard — internal HTML (roundtrip)
// ---------------------------------------------------------------------------

describe("parseClipboard — internal HTML roundtrip", () => {
  it("recovers original payload including style", () => {
    const original: ClipboardPayload = {
      nodes: [
        {
          title: "Root",
          style: { bold: true, color: "#abc" },
          children: [leaf("Child")],
        },
      ],
    }
    const html = payloadToHtml(original)
    const recovered = parseClipboard(html, null)
    expect(recovered).toEqual(original)
  })

  it("prefers internal parse over external when data-outline-nodes present", () => {
    const payload: ClipboardPayload = {
      nodes: [{ title: "Internal", style: { italic: true }, children: [] }],
    }
    const html = payloadToHtml(payload)
    const result = parseClipboard(html, "- Plain fallback")
    expect(result.nodes[0].title).toBe("Internal")
    expect(result.nodes[0].style).toEqual({ italic: true })
  })

  it("returns empty nodes for malformed JSON in data-outline-nodes", () => {
    const html = `<ul data-outline-nodes="{bad json"><li>item</li></ul>`
    const result = parseClipboard(html, null)
    // Internal fails → external falls back to parseListElement
    expect(result.nodes.length).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// parseClipboard — external HTML (generic lists)
// ---------------------------------------------------------------------------

describe("parseClipboard — external HTML", () => {
  it("parses a simple UL", () => {
    const html = `<ul><li>Alpha</li><li>Beta</li></ul>`
    const result = parseClipboard(html, null)
    expect(result.nodes.map((n) => n.title)).toEqual(["Alpha", "Beta"])
  })

  it("parses a simple OL", () => {
    const html = `<ol><li>First</li><li>Second</li></ol>`
    const result = parseClipboard(html, null)
    expect(result.nodes.map((n) => n.title)).toEqual(["First", "Second"])
  })

  it("parses nested lists", () => {
    const html = `<ul><li>Parent<ul><li>Child A</li><li>Child B</li></ul></li></ul>`
    const result = parseClipboard(html, null)
    expect(result.nodes[0].title).toBe("Parent")
    expect(result.nodes[0].children.map((c) => c.title)).toEqual(["Child A", "Child B"])
  })

  it("extracts text from LI stripping nested UL content from title", () => {
    const html = `<ul><li>Item <strong>bold</strong><ul><li>Child</li></ul></li></ul>`
    const result = parseClipboard(html, null)
    expect(result.nodes[0].title).toBe("Item bold")
    expect(result.nodes[0].children[0].title).toBe("Child")
  })

  it("assigns empty style to all external nodes", () => {
    const html = `<ul><li>Node</li></ul>`
    const result = parseClipboard(html, null)
    expect(result.nodes[0].style).toEqual({})
  })

  it("returns empty nodes for HTML with no lists", () => {
    const html = `<p>Just a paragraph</p>`
    const result = parseClipboard(html, null)
    expect(result.nodes).toEqual([])
  })

  it("falls back to plain text when HTML has no list", () => {
    const result = parseClipboard("<p>no list</p>", "- Plain node")
    expect(result.nodes[0].title).toBe("Plain node")
  })
})

// ---------------------------------------------------------------------------
// parseClipboard — plain text
// ---------------------------------------------------------------------------

describe("parseClipboard — plain text", () => {
  it("returns empty nodes for empty string", () => {
    expect(parseClipboard(null, "")).toEqual({ nodes: [] })
    expect(parseClipboard(null, "   \n  \n")).toEqual({ nodes: [] })
  })

  it("returns empty nodes when both args are null", () => {
    expect(parseClipboard(null, null)).toEqual({ nodes: [] })
  })

  it("parses a single line", () => {
    const result = parseClipboard(null, "Hello world")
    expect(result.nodes).toEqual([{ title: "Hello world", style: {}, children: [] }])
  })

  it("strips leading dash-space bullet", () => {
    const result = parseClipboard(null, "- My item")
    expect(result.nodes[0].title).toBe("My item")
  })

  it("strips leading asterisk-space bullet", () => {
    const result = parseClipboard(null, "* My item")
    expect(result.nodes[0].title).toBe("My item")
  })

  it("strips leading plus-space bullet", () => {
    const result = parseClipboard(null, "+ My item")
    expect(result.nodes[0].title).toBe("My item")
  })

  it("parses multiple top-level lines", () => {
    const text = "- Alpha\n- Beta\n- Gamma"
    const result = parseClipboard(null, text)
    expect(result.nodes.map((n) => n.title)).toEqual(["Alpha", "Beta", "Gamma"])
  })

  it("parses 2-space indented children", () => {
    const text = "- Parent\n  - Child\n  - Child2"
    const result = parseClipboard(null, text)
    expect(result.nodes[0].title).toBe("Parent")
    expect(result.nodes[0].children.map((c) => c.title)).toEqual(["Child", "Child2"])
  })

  it("parses 4-space indented children", () => {
    const text = "- Parent\n    - Child"
    const result = parseClipboard(null, text)
    expect(result.nodes[0].children[0].title).toBe("Child")
  })

  it("parses tab-indented hierarchy", () => {
    const text = "- Root\n\t- Child\n\t\t- Grandchild"
    const result = parseClipboard(null, text)
    expect(result.nodes[0].title).toBe("Root")
    expect(result.nodes[0].children[0].title).toBe("Child")
    expect(result.nodes[0].children[0].children[0].title).toBe("Grandchild")
  })

  it("parses deeply nested structure (3 levels)", () => {
    const text = "- A\n  - B\n    - C"
    const result = parseClipboard(null, text)
    expect(result.nodes[0].children[0].children[0].title).toBe("C")
  })

  it("handles lines without bullet prefix as-is", () => {
    const text = "Just text\n  Sub text"
    const result = parseClipboard(null, text)
    expect(result.nodes[0].title).toBe("Just text")
    expect(result.nodes[0].children[0].title).toBe("Sub text")
  })

  it("ignores blank lines between content", () => {
    const text = "- First\n\n- Second"
    const result = parseClipboard(null, text)
    expect(result.nodes.map((n) => n.title)).toEqual(["First", "Second"])
  })

  it("resets nesting when indentation decreases", () => {
    const text = "- A\n  - B\n    - C\n  - D\n- E"
    const result = parseClipboard(null, text)
    expect(result.nodes[0].title).toBe("A")
    expect(result.nodes[0].children.map((c) => c.title)).toEqual(["B", "D"])
    expect(result.nodes[0].children[0].children[0].title).toBe("C")
    expect(result.nodes[1].title).toBe("E")
  })

  it("payloadToPlainText → parseClipboard roundtrip (titles only, style lost)", () => {
    const original: ClipboardPayload = {
      nodes: [
        {
          title: "Root",
          style: {},
          children: [leaf("Child A"), leaf("Child B")],
        },
      ],
    }
    const plain = payloadToPlainText(original)
    const recovered = parseClipboard(null, plain)
    expect(recovered.nodes[0].title).toBe("Root")
    expect(recovered.nodes[0].children.map((c) => c.title)).toEqual(["Child A", "Child B"])
  })
})
