import * as Y from "yjs"
import * as fflate from "fflate"
import { DexieYProvider } from "y-dexie"
import { db, getNodesMap, createOutline } from "../store"
import { NodeYRecord } from "../types"

interface Manifest {
  version: number
  name: string
  createdAt: number
  exportedAt: number
}

interface ImagesMeta {
  [uuid: string]: { mimeType: string }
}

export async function exportOutline(outlineId: string): Promise<Uint8Array> {
  // 1. Load outline row
  const outline = await db.outlines.get(outlineId)
  if (!outline) throw new Error("Outline not found")

  // 2. Load Y.Doc, extract nodes
  const doc = outline.content
  const provider = DexieYProvider.load(doc)
  await provider.whenLoaded

  const nodesMap = getNodesMap(doc)
  const nodes: Record<string, NodeYRecord> = {}
  const nodeIds: string[] = []
  nodesMap.forEach((record, id) => {
    nodes[id] = record
    nodeIds.push(id)
  })

  DexieYProvider.release(doc)

  // 3. Load node content docs and encode
  const contentEntries: Record<string, Uint8Array> = {}
  if (nodeIds.length > 0) {
    const contentRows = await db.nodeContents
      .where("nodeId")
      .anyOf(nodeIds)
      .toArray()
    for (const row of contentRows) {
      if (!row.content) continue
      const encoded = new Uint8Array(Y.encodeStateAsUpdate(row.content))
      if (encoded.length > 2) {
        contentEntries[`contents/${row.nodeId}`] = encoded
      }
    }
  }

  // 4. Scan content bytes for ol-image:// UUIDs
  const imageUuids = new Set<string>()
  const uuidPattern = /ol-image:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g
  for (const encoded of Object.values(contentEntries)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(encoded)
    for (const match of text.matchAll(uuidPattern)) {
      imageUuids.add(match[1])
    }
  }

  // 5. Load images
  const imagesMeta: ImagesMeta = {}
  const imageEntries: Record<string, Uint8Array> = {}
  if (imageUuids.size > 0) {
    const imageRows = await db.images.bulkGet([...imageUuids])
    for (const imageRow of imageRows) {
      if (!imageRow) continue
      imagesMeta[imageRow.id] = { mimeType: imageRow.mimeType }
      const buf = await imageRow.blob.arrayBuffer()
      imageEntries[`images/${imageRow.id}`] = new Uint8Array(buf)
    }
  }

  // 6. Build and return ZIP
  const manifest: Manifest = {
    version: 1,
    name: outline.name,
    createdAt: outline.createdAt,
    exportedAt: Date.now(),
  }

  // Use new Uint8Array(TextEncoder result) so the value is an instance of the
  // local Uint8Array class, which passes fflate's internal `instanceof` check.
  const toU8 = (s: string) => new Uint8Array(new TextEncoder().encode(s))
  const files: fflate.Zippable = {
    "manifest.json": toU8(JSON.stringify(manifest)),
    "nodes.json": toU8(JSON.stringify(nodes)),
    "images.json": toU8(JSON.stringify(imagesMeta)),
    ...contentEntries,
    ...imageEntries,
  }

  return fflate.zipSync(files)
}

export async function importOutlineFromZip(
  zipBytes: Uint8Array,
): Promise<string> {
  // 1. Unzip and parse
  const unzipped = fflate.unzipSync(zipBytes)
  const dec = new TextDecoder()
  const manifest: Manifest = JSON.parse(dec.decode(unzipped["manifest.json"]))
  const nodes: Record<string, NodeYRecord> = JSON.parse(
    dec.decode(unzipped["nodes.json"]),
  )
  const imagesMeta: ImagesMeta = unzipped["images.json"]
    ? JSON.parse(dec.decode(unzipped["images.json"]))
    : {}

  // 2. Build node ID remapping
  const idMap = new Map<string, string>()
  for (const oldId of Object.keys(nodes)) {
    idMap.set(oldId, crypto.randomUUID())
  }

  // 3. Image deduplication — preserve UUIDs, skip if already present
  for (const [uuid, meta] of Object.entries(imagesMeta)) {
    const existing = await db.images.get(uuid)
    if (!existing) {
      const bytes = unzipped[`images/${uuid}`]
      if (bytes) {
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: meta.mimeType })
        await db.images.put({
          id: uuid,
          blob,
          mimeType: meta.mimeType,
          size: bytes.length,
          createdAt: Date.now(),
        })
      }
    }
  }

  // 4. Create outline and populate nodes
  const outlineId = await createOutline(manifest.name)
  const outline = await db.outlines.get(outlineId)
  if (!outline) throw new Error("Failed to get outline after creation")

  const outlineDoc = outline.content
  const outlineProvider = DexieYProvider.load(outlineDoc)
  await outlineProvider.whenLoaded

  const nodesMap = getNodesMap(outlineDoc)
  outlineDoc.transact(() => {
    for (const [oldId, record] of Object.entries(nodes)) {
      const newId = idMap.get(oldId)!
      const newParentId = record.parentId
        ? (idMap.get(record.parentId) ?? null)
        : null
      nodesMap.set(newId, { ...record, parentId: newParentId })
    }
  })

  DexieYProvider.release(outlineDoc)

  // 5. Restore node content docs
  for (const [path, encoded] of Object.entries(unzipped)) {
    if (!path.startsWith("contents/")) continue
    const oldNodeId = path.slice("contents/".length)
    const newNodeId = idMap.get(oldNodeId)
    if (!newNodeId) continue

    await db.nodeContents.put({ nodeId: newNodeId } as any)
    const row = await db.nodeContents.get(newNodeId)
    if (!row?.content) continue

    const contentDoc = row.content
    const contentProvider = DexieYProvider.load(contentDoc)
    await contentProvider.whenLoaded
    Y.applyUpdate(contentDoc, encoded)
    DexieYProvider.release(contentDoc)
  }

  return outlineId
}
