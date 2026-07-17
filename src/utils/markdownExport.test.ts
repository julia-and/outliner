import { describe, it, expect } from "vitest"
import {
  subtreeToMarkdown,
  transformContent,
  escapeTitle,
} from "./markdownExport"
import type { PMJson } from "./markdownExport"
import type { NodeYRecord } from "../types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNodesMap(
  nodes: Array<{ id: string } & Partial<NodeYRecord>>,
): Map<string, NodeYRecord> {
  const map = new Map<string, NodeYRecord>()
  let order = 0
  for (const { id, ...rest } of nodes) {
    map.set(id, {
      parentId: null,
      title: id,
      order: order++,
      collapsed: false,
      style: {},
      data: {},
      createdAt: 0,
      modifiedAt: 0,
      ...rest,
    })
  }
  return map
}

function paragraphDoc(text: string): PMJson {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  }
}

// Minimal serializer: paragraphs → text, headings → #-prefixed lines.
function stubSerialize(json: PMJson): string {
  const renderBlock = (node: PMJson): string => {
    const text = (node.content ?? [])
      .map((n: PMJson) => n.text ?? "")
      .join("")
    if (node.type === "heading") return "#".repeat(node.attrs.level) + " " + text
    return text
  }
  return (json.content ?? []).map(renderBlock).join("\n\n")
}

function contentFrom(
  docs: Record<string, PMJson | null>,
): (nodeId: string) => Promise<PMJson | null> {
  return (nodeId) => Promise.resolve(docs[nodeId] ?? null)
}

const noContent = () => Promise.resolve<PMJson | null>(null)

// ---------------------------------------------------------------------------
// subtreeToMarkdown
// ---------------------------------------------------------------------------

describe("subtreeToMarkdown", () => {
  it("renders bare-leaf root as h1 heading", async () => {
    const map = makeNodesMap([{ id: "root", title: "Solo" }])
    const md = await subtreeToMarkdown("root", map, noContent, stubSerialize)
    expect(md).toBe("# Solo")
  })

  it("renders heading levels by depth and bullets for contentless leaves", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Project X" },
      { id: "design", title: "Design", parentId: "root" },
      { id: "note", title: "quick note leaf", parentId: "design" },
      { id: "nested", title: "Nested idea", parentId: "design" },
      { id: "deep", title: "deep leaf", parentId: "nested" },
    ])
    const md = await subtreeToMarkdown(
      "root",
      map,
      contentFrom({
        root: paragraphDoc("Root content here."),
        nested: paragraphDoc("Its content."),
      }),
      stubSerialize,
    )
    expect(md).toBe(
      [
        "# Project X",
        "",
        "Root content here.",
        "",
        "## Design",
        "",
        "- quick note leaf",
        "",
        "### Nested idea",
        "",
        "Its content.",
        "",
        "- deep leaf",
      ].join("\n"),
    )
  })

  it("clamps heading level at 6", async () => {
    const chain = ["a", "b", "c", "d", "e", "f", "g", "h"]
    const map = makeNodesMap(
      chain.map((id, i) => ({
        id,
        parentId: i === 0 ? null : chain[i - 1]!,
        // Give everyone a child except the last, so all render as headings.
      })),
    )
    const md = await subtreeToMarkdown("a", map, noContent, stubSerialize)
    expect(md).toContain("###### g")
    expect(md).toContain("- h")
    expect(md).not.toContain("####### ")
  })

  it("joins consecutive bullet siblings tightly", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "a", title: "one", parentId: "root" },
      { id: "b", title: "two", parentId: "root" },
      { id: "c", title: "three", parentId: "root" },
    ])
    const md = await subtreeToMarkdown("root", map, noContent, stubSerialize)
    expect(md).toBe("# Root\n\n- one\n- two\n- three")
  })

  it("interleaves bullets with heading siblings in order", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "a", title: "leaf a", parentId: "root" },
      { id: "b", title: "Section", parentId: "root" },
      { id: "b1", title: "sub leaf", parentId: "b" },
      { id: "c", title: "leaf c", parentId: "root" },
    ])
    const md = await subtreeToMarkdown("root", map, noContent, stubSerialize)
    expect(md).toBe(
      "# Root\n\n- leaf a\n\n## Section\n\n- sub leaf\n\n- leaf c",
    )
  })

  it("treats empty doc content array as no content, without serializing", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "leaf", title: "leaf", parentId: "root" },
    ])
    const boom = () => {
      throw new Error("must not serialize empty doc")
    }
    const md = await subtreeToMarkdown(
      "root",
      map,
      contentFrom({ leaf: { type: "doc", content: [] } }),
      boom,
    )
    expect(md).toBe("# Root\n\n- leaf")
  })

  it("treats whitespace-only serialized content as empty", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "leaf", title: "leaf", parentId: "root" },
    ])
    const md = await subtreeToMarkdown(
      "root",
      map,
      contentFrom({ leaf: paragraphDoc("   ") }),
      stubSerialize,
    )
    expect(md).toBe("# Root\n\n- leaf")
  })

  it("promotes leaf with content to heading", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "leaf", title: "Leafy", parentId: "root" },
    ])
    const md = await subtreeToMarkdown(
      "root",
      map,
      contentFrom({ leaf: paragraphDoc("body") }),
      stubSerialize,
    )
    expect(md).toBe("# Root\n\n## Leafy\n\nbody")
  })

  it("demotes content headings by the item's heading level", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "child", title: "Child", parentId: "root" },
      { id: "grand", title: "Grand", parentId: "child" },
    ])
    const md = await subtreeToMarkdown(
      "root",
      map,
      contentFrom({
        grand: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2, id: "" },
              content: [{ type: "text", text: "section" }],
            },
          ],
        },
      }),
      stubSerialize,
    )
    // grand is h3 (depth 2), content h2 → h5
    expect(md).toContain("### Grand")
    expect(md).toContain("##### section")
  })

  it("returns empty string when rootId missing from map", async () => {
    const map = makeNodesMap([{ id: "other" }])
    const md = await subtreeToMarkdown("gone", map, noContent, stubSerialize)
    expect(md).toBe("")
  })

  it("terminates on parentId cycles", async () => {
    const map = makeNodesMap([
      { id: "root", title: "Root" },
      { id: "a", title: "A", parentId: "root" },
    ])
    // Corrupt: root claims to be a's child. The cycle makes "a" look like it
    // has a child, so it renders as a heading; the revisit of root is skipped.
    map.get("root")!.parentId = "a"
    const md = await subtreeToMarkdown("root", map, noContent, stubSerialize)
    expect(md).toBe("# Root\n\n## A")
  })
})

// ---------------------------------------------------------------------------
// transformContent
// ---------------------------------------------------------------------------

describe("transformContent", () => {
  it("demotes headings with clamp and preserves other attrs", () => {
    const json: PMJson = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1, id: "x" }, content: [] },
        { type: "heading", attrs: { level: 5, id: "y" }, content: [] },
      ],
    }
    transformContent(json, 3)
    expect(json.content[0].attrs).toEqual({ level: 4, id: "x" })
    expect(json.content[1].attrs).toEqual({ level: 6, id: "y" })
  })

  it("defaults missing heading level to 1", () => {
    const json: PMJson = {
      type: "doc",
      content: [{ type: "heading", content: [] }],
    }
    transformContent(json, 2)
    expect(json.content[0].attrs.level).toBe(3)
  })

  it("rewrites node_link to plain text", () => {
    const json: PMJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "node_link", attrs: { nodeId: "id1", label: "My node" } },
          ],
        },
      ],
    }
    transformContent(json, 0)
    expect(json.content[0].content).toEqual([
      { type: "text", text: "My node" },
    ])
  })

  it("falls back to nodeId, drops node_link when both empty", () => {
    const json: PMJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "node_link", attrs: { nodeId: "id1", label: "" } },
            { type: "node_link", attrs: { nodeId: "", label: "" } },
          ],
        },
      ],
    }
    transformContent(json, 0)
    expect(json.content[0].content).toEqual([{ type: "text", text: "id1" }])
  })

  it("recurses into nested content", () => {
    const json: PMJson = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "heading", attrs: { level: 1 }, content: [] }],
        },
      ],
    }
    transformContent(json, 1)
    expect(json.content[0].content[0].attrs.level).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// escapeTitle
// ---------------------------------------------------------------------------

describe("escapeTitle", () => {
  it("passes plain titles through", () => {
    expect(escapeTitle("Hello world")).toBe("Hello world")
  })

  it("escapes leading structural tokens", () => {
    expect(escapeTitle("# fake heading")).toBe("\\# fake heading")
    expect(escapeTitle("- fake bullet")).toBe("\\- fake bullet")
    expect(escapeTitle("* star")).toBe("\\* star")
    expect(escapeTitle("> quote")).toBe("\\> quote")
    expect(escapeTitle("1. ordered")).toBe("1\\. ordered")
    expect(escapeTitle("42. answer")).toBe("42\\. answer")
  })

  it("leaves non-leading and mid-word tokens alone", () => {
    expect(escapeTitle("a - b")).toBe("a - b")
    expect(escapeTitle("#hashtag")).toBe("#hashtag")
    expect(escapeTitle("1.5 liters")).toBe("1.5 liters")
  })

  it("escapes bare token titles", () => {
    expect(escapeTitle("-")).toBe("\\-")
    expect(escapeTitle("#")).toBe("\\#")
  })

  it("collapses newlines", () => {
    expect(escapeTitle("line1\nline2")).toBe("line1 line2")
    expect(escapeTitle("line1 \n\n line2")).toBe("line1 line2")
  })

  it("renders empty and whitespace-only titles as (untitled)", () => {
    expect(escapeTitle("")).toBe("(untitled)")
    expect(escapeTitle("  \n ")).toBe("(untitled)")
  })
})
