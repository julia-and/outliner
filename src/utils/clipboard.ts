import { NodeStyle, NodeYRecord } from "../types"

export interface ClipboardNode {
  title: string
  style: NodeStyle
  children: ClipboardNode[]
}

export interface ClipboardPayload {
  nodes: ClipboardNode[]
}

export function buildClipboardPayload(
  rootId: string,
  nodesMap: Map<string, NodeYRecord>,
): ClipboardPayload {
  const childMap = new Map<string | null, [string, NodeYRecord][]>()
  for (const [id, node] of nodesMap) {
    const key = node.parentId
    if (!childMap.has(key)) childMap.set(key, [])
    childMap.get(key)!.push([id, node])
  }
  for (const children of childMap.values()) {
    children.sort(([, a], [, b]) => a.order - b.order)
  }

  const buildNode = (id: string): ClipboardNode | null => {
    const node = nodesMap.get(id)
    if (!node) return null
    const children = (childMap.get(id) ?? [])
      .map(([childId]) => buildNode(childId))
      .filter((n): n is ClipboardNode => n !== null)
    return {
      title: node.title,
      style: node.style ?? {},
      children,
    }
  }

  const root = buildNode(rootId)
  return { nodes: root ? [root] : [] }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderNodes(nodes: ClipboardNode[]): string {
  return nodes
    .map(
      (n) =>
        `<li data-title="${escapeHtml(n.title)}">${escapeHtml(n.title)}${
          n.children.length > 0 ? `<ul>${renderNodes(n.children)}</ul>` : ""
        }</li>`,
    )
    .join("")
}

export function payloadToHtml(payload: ClipboardPayload): string {
  const json = JSON.stringify(payload)
  return `<ul data-outline-nodes="${escapeHtml(json)}">${renderNodes(payload.nodes)}</ul>`
}

export function payloadToPlainText(payload: ClipboardPayload): string {
  const lines: string[] = []
  const visit = (node: ClipboardNode, depth: number) => {
    lines.push("  ".repeat(depth) + "- " + node.title)
    for (const child of node.children) visit(child, depth + 1)
  }
  for (const node of payload.nodes) visit(node, 0)
  return lines.join("\n")
}

function parseInternalHtml(html: string): ClipboardPayload | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const ul = doc.querySelector("ul[data-outline-nodes]")
    if (!ul) return null
    const json = ul.getAttribute("data-outline-nodes")
    if (!json) return null
    return JSON.parse(json) as ClipboardPayload
  } catch {
    return null
  }
}

function extractLiTitle(li: Element): string {
  let text = ""
  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? ""
    } else if (
      child.nodeType === Node.ELEMENT_NODE &&
      (child as Element).tagName !== "UL" &&
      (child as Element).tagName !== "OL"
    ) {
      text += (child as Element).textContent ?? ""
    }
  }
  return text.trim()
}

function parseListElement(ul: Element): ClipboardNode[] {
  const result: ClipboardNode[] = []
  for (const child of Array.from(ul.children)) {
    if (child.tagName !== "LI") continue
    const title = extractLiTitle(child)
    const nestedList = child.querySelector(":scope > ul, :scope > ol")
    const children = nestedList ? parseListElement(nestedList) : []
    result.push({ title, style: {}, children })
  }
  return result
}

function parseExternalHtml(html: string): ClipboardPayload | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const topList = doc.querySelector("ul, ol")
    if (!topList) return null
    const nodes = parseListElement(topList)
    return { nodes }
  } catch {
    return null
  }
}

function parsePlainText(plain: string): ClipboardPayload {
  const lines = plain.split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { nodes: [] }

  let indentUnit = ""
  for (const line of lines) {
    const match = line.match(/^(\s+)/)
    if (match) {
      indentUnit = match[1]
      break
    }
  }

  const getDepth = (line: string): number => {
    if (!indentUnit) return 0
    const match = line.match(/^(\s*)/)
    const leading = match ? match[1] : ""
    if (leading.includes("\t")) {
      return leading.split("\t").length - 1
    }
    return Math.floor(leading.length / indentUnit.length)
  }

  const stripBullet = (line: string): string => {
    return line.replace(/^[-*+] /, "").trim()
  }

  interface StackEntry {
    node: ClipboardNode
    depth: number
  }

  const roots: ClipboardNode[] = []
  const stack: StackEntry[] = []

  for (const line of lines) {
    const depth = getDepth(line)
    const title = stripBullet(line.trim())
    const node: ClipboardNode = { title, style: {}, children: [] }

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }

    stack.push({ node, depth })
  }

  return { nodes: roots }
}

export function parseClipboard(
  html: string | null,
  plain: string | null,
): ClipboardPayload {
  if (html) {
    const internal = parseInternalHtml(html)
    if (internal && internal.nodes.length > 0) return internal

    const external = parseExternalHtml(html)
    if (external && external.nodes.length > 0) return external
  }

  if (plain) {
    return parsePlainText(plain)
  }

  return { nodes: [] }
}
