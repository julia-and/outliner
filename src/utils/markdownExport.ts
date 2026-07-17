import { NodeYRecord } from "../types"

// Structural type for ProseMirror node JSON (what yDocToProsemirrorJSON
// returns and Node.fromJSON accepts).
export interface PMJson {
  type?: string
  text?: string
  attrs?: { level?: number; label?: string; nodeId?: string } & Record<
    string,
    unknown
  >
  content?: PMJson[]
  [key: string]: unknown
}

// Demote headings by `demoteBy` (clamped at 6) and flatten node_link chips to
// plain text, in place. The JSON comes fresh from yDocToProsemirrorJSON per
// node, so in-place mutation is safe (no shared structure).
export function transformContent(json: PMJson, demoteBy: number): PMJson {
  const visit = (node: PMJson): PMJson | null => {
    if (node.type === "heading") {
      node.attrs = {
        ...node.attrs,
        level: Math.min((node.attrs?.level ?? 1) + demoteBy, 6),
      }
    } else if (node.type === "node_link") {
      const text = node.attrs?.label || node.attrs?.nodeId
      // Empty PM text nodes are invalid (Node.fromJSON throws) — drop instead.
      if (!text) return null
      return { type: "text", text }
    }
    if (Array.isArray(node.content)) {
      node.content = node.content
        .map(visit)
        .filter((n: PMJson | null): n is PMJson => n !== null)
    }
    return node
  }
  visit(json)
  return json
}

// Titles go raw into `# title` / `- title` lines: collapse newlines, escape a
// leading structural token so the title can't change the document structure.
export function escapeTitle(title: string): string {
  const flat = title.replace(/\s*\n+\s*/g, " ").trim()
  if (!flat) return "(untitled)"
  return flat.replace(/^([#>*+-]|\d+\.)(?=\s|$)/, (m) =>
    m.endsWith(".") ? m.slice(0, -1) + "\\." : "\\" + m,
  )
}

interface Block {
  kind: "heading" | "bullet" | "content"
  text: string
  // Set for bullets: sibling runs join tight (\n); bullets from different
  // parents that end up adjacent stay \n\n-separated.
  parentId?: string
}

// Join blocks: runs of adjacent sibling bullets tight (\n), else \n\n.
function joinBlocks(blocks: Block[]): string {
  let out = ""
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (i > 0) {
      const prev = blocks[i - 1]!
      const tight =
        prev.kind === "bullet" &&
        block.kind === "bullet" &&
        prev.parentId === block.parentId
      out += tight ? "\n" : "\n\n"
    }
    out += block.text
  }
  return out
}

// Renders the subtree rooted at rootId as markdown. An item renders as a
// heading (level = depth+1, clamped at 6) when it has children or non-empty
// content; a contentless leaf renders as a bullet under its parent's heading.
// The copied root always renders as a heading. Content headings are demoted
// by the item's heading level.
//
// Serialization errors propagate and abort the whole copy — the Milkdown
// serializer is stateful across calls, so catch-and-continue per node would
// corrupt subsequent output.
export async function subtreeToMarkdown(
  rootId: string,
  nodesMap: Map<string, NodeYRecord>,
  getContentJSON: (nodeId: string) => Promise<PMJson | null>,
  serialize: (json: PMJson) => string,
): Promise<string> {
  const childMap = new Map<string | null, [string, NodeYRecord][]>()
  for (const [id, node] of nodesMap) {
    const key = node.parentId
    if (!childMap.has(key)) childMap.set(key, [])
    childMap.get(key)!.push([id, node])
  }
  for (const children of childMap.values()) {
    children.sort(([, a], [, b]) => a.order - b.order)
  }

  const visited = new Set<string>()

  const render = async (id: string, depth: number): Promise<Block[]> => {
    const node = nodesMap.get(id)
    if (!node || visited.has(id)) return []
    visited.add(id)

    const level = Math.min(depth + 1, 6)
    const json = await getContentJSON(id)
    // A visited-but-never-edited node yields {type:"doc", content:[]}, which
    // is invalid against the doc schema (block+) and crashes the serializer.
    const content = json?.content?.length
      ? serialize(transformContent(json, level)).trim()
      : ""
    const childIds = (childMap.get(id) ?? []).map(([childId]) => childId)

    // Contentless leaf below the root → bullet.
    if (depth > 0 && childIds.length === 0 && !content) {
      return [
        {
          kind: "bullet",
          text: "- " + escapeTitle(node.title),
          parentId: node.parentId ?? undefined,
        },
      ]
    }

    const blocks: Block[] = [
      { kind: "heading", text: "#".repeat(level) + " " + escapeTitle(node.title) },
    ]
    if (content) blocks.push({ kind: "content", text: content })
    for (const childId of childIds) {
      blocks.push(...(await render(childId, depth + 1)))
    }
    return blocks
  }

  return joinBlocks(await render(rootId, 0))
}
