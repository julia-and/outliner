import { DexieYProvider } from "y-dexie"
import { db } from "./db"
import { createNode, getNodesMap } from "./nodeOps"
import { parseDocx, DocxSection } from "./utils/importDocx"

const justCreatedIds = new Set<string>()

export async function createOutline(name: string): Promise<string> {
  const id = crypto.randomUUID()
  await db.outlines.add({ id, name, createdAt: Date.now() })
  justCreatedIds.add(id)
  return id
}

export function consumeIsJustCreated(id: string): boolean {
  const was = justCreatedIds.has(id)
  justCreatedIds.delete(id)
  return was
}

export async function renameOutline(id: string, name: string): Promise<void> {
  await db.outlines.update(id, { name })
}

export async function deleteOutline(id: string): Promise<void> {
  await db.outlines.delete(id)
}

export async function exportOutlineToFile(outlineId: string): Promise<void> {
  const { exportOutline } = await import("./utils/outlineIO")
  const zipBytes = await exportOutline(outlineId)
  const outline = await db.outlines.get(outlineId)
  const safeName = (outline?.name ?? "outline").replace(/[^a-z0-9_\-. ]/gi, "_")
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
    type: "application/octet-stream",
  })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${safeName}.olz`,
  })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function importOutlineFromFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { importOutlineFromZip } = await import("./utils/outlineIO")
  return importOutlineFromZip(bytes)
}

export async function importDocxAsOutline(file: File): Promise<string> {
  const parsed = await parseDocx(file)
  const id = await createOutline(parsed.title)
  const outline = await db.outlines.get(id)
  if (!outline) throw new Error("Failed to get outline after creation")
  const doc = outline.content
  const provider = DexieYProvider.load(doc)
  await provider.whenLoaded

  const insertSection = (section: DocxSection, parentId: string | null) => {
    const nodeId = createNode(doc, parentId, section.title)
    if (section.content.trim()) {
      const nodesMap = getNodesMap(doc)
      const node = nodesMap.get(nodeId)
      if (node) {
        nodesMap.set(nodeId, {
          ...node,
          data: { ...node.data, pendingContent: section.content.trim() },
        })
      }
    }
    for (const child of section.children) {
      insertSection(child, nodeId)
    }
  }

  doc.transact(() => {
    for (const section of parsed.sections) {
      insertSection(section, null)
    }
  })

  DexieYProvider.release(doc)
  return id
}
