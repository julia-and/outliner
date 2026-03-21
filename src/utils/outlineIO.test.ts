// Must be the very first import to install fake IndexedDB before Dexie loads.
import "fake-indexeddb/auto"

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as Y from "yjs"
import * as fflate from "fflate"

// ---------------------------------------------------------------------------
// Same mocks as store.test.ts
// ---------------------------------------------------------------------------

vi.mock("dexie-cloud-addon", () => ({
  default: (db: any) => {
    db.cloud = { configure: vi.fn() }
  },
}))

vi.mock("y-dexie", () => ({
  default: vi.fn(),
  DexieYProvider: {
    load: vi.fn(() => ({ whenLoaded: Promise.resolve() })),
    release: vi.fn(),
  },
}))

import { db, getNodesMap } from "../store"
import { exportOutline, importOutlineFromZip } from "./outlineIO"

// ---------------------------------------------------------------------------
// Y.Doc side-maps
//
// fake-indexeddb uses structured clone, which can't clone Y.Doc (contains
// functions). We intercept DB calls to strip Y.Doc objects before storage
// and inject them back on retrieval from these in-memory maps.
// ---------------------------------------------------------------------------

const outlineDocMap = new Map<string, Y.Doc>()
const nodeContentDocMap = new Map<string, Y.Doc>()
const imageMap = new Map<string, any>()

beforeEach(async () => {
  outlineDocMap.clear()
  nodeContentDocMap.clear()
  imageMap.clear()

  await Promise.all([
    db.outlines.clear(),
    db.nodeContents.clear(),
  ])

  // --- outlines ---
  const origOutlinesAdd = db.outlines.add.bind(db.outlines)
  const origOutlinesGet = db.outlines.get.bind(db.outlines)

  vi.spyOn(db.outlines, "add").mockImplementation(async (item: any) => {
    const doc = item.content instanceof Y.Doc ? item.content : new Y.Doc()
    const { content: _c, ...rest } = item
    const key = await origOutlinesAdd(rest as any)
    outlineDocMap.set(rest.id, doc)
    return key
  })

  vi.spyOn(db.outlines, "get").mockImplementation(async (id: any) => {
    const row = await origOutlinesGet(id)
    if (!row) return undefined
    return { ...row, content: outlineDocMap.get(row.id as string) ?? new Y.Doc() }
  })

  // --- nodeContents put / get ---
  const origNCPut = db.nodeContents.put.bind(db.nodeContents)
  const origNCGet = db.nodeContents.get.bind(db.nodeContents)

  vi.spyOn(db.nodeContents, "put").mockImplementation(async (item: any) => {
    const doc =
      item.content instanceof Y.Doc
        ? item.content
        : (nodeContentDocMap.get(item.nodeId) ?? new Y.Doc())
    nodeContentDocMap.set(item.nodeId, doc)
    const { content: _c, ...rest } = item
    return origNCPut(rest as any)
  })

  vi.spyOn(db.nodeContents, "get").mockImplementation(async (key: any) => {
    const row = await origNCGet(key)
    if (!row) return undefined
    return { ...row, content: nodeContentDocMap.get(row.nodeId) }
  })

  // --- nodeContents where query (used by exportOutline) ---
  vi.spyOn(db.nodeContents, "where").mockImplementation((key: any) => {
    if (key === "nodeId") {
      return {
        anyOf: (ids: string[]) => ({
          toArray: async () =>
            ids
              .filter((id) => nodeContentDocMap.has(id))
              .map((id) => ({ nodeId: id, content: nodeContentDocMap.get(id) })),
        }),
      } as any
    }
    return { anyOf: () => ({ toArray: async () => [] }) } as any
  })

  // --- images (Blob can't survive structuredClone with methods intact) ---
  vi.spyOn(db.images, "put").mockImplementation(async (item: any) => {
    imageMap.set(item.id, item)
    return item.id
  })
  vi.spyOn(db.images, "get").mockImplementation(async (id: any) => {
    return imageMap.get(id) ?? undefined
  })
  vi.spyOn(db.images, "bulkGet").mockImplementation(async (ids: any) => {
    return (ids as string[]).map((id) => imageMap.get(id) ?? undefined)
  })
  vi.spyOn(db.images, "count").mockImplementation(async () => imageMap.size)
  vi.spyOn(db.images, "clear").mockImplementation(async () => {
    imageMap.clear()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(
  nodes: Array<{
    id: string
    parentId?: string | null
    title?: string
    order?: number
    collapsed?: boolean
    style?: Record<string, unknown>
  }>,
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
      data: {},
    })
  }
  return doc
}

async function seedOutline(name: string, doc: Y.Doc): Promise<string> {
  const id = crypto.randomUUID()
  // db.outlines.add spy handles Y.Doc → outlineDocMap
  await db.outlines.add({ id, name, createdAt: Date.now(), content: doc } as any)
  return id
}

// ---------------------------------------------------------------------------
// Round-trip: node fidelity
// ---------------------------------------------------------------------------

describe("round-trip node fidelity", () => {
  it("preserves titles and tree structure", async () => {
    const doc = makeDoc([
      { id: "r1", title: "Root One", order: 0 },
      { id: "r2", title: "Root Two", order: 1 },
      { id: "c1", parentId: "r1", title: "Child One", order: 0 },
      { id: "c2", parentId: "r1", title: "Child Two", order: 1 },
    ])
    const outlineId = await seedOutline("My Outline", doc)

    const zipBytes = await exportOutline(outlineId)
    const importedId = await importOutlineFromZip(zipBytes)

    expect(importedId).not.toBe(outlineId)

    const imported = await db.outlines.get(importedId)
    expect(imported?.name).toBe("My Outline")

    const nodesMap = getNodesMap(imported!.content)
    expect(nodesMap.size).toBe(4)

    const titles = Array.from(nodesMap.values())
      .map((n) => n.title)
      .sort()
    expect(titles).toEqual(["Child One", "Child Two", "Root One", "Root Two"])

    // Root nodes have null parentId
    const roots = Array.from(nodesMap.values()).filter((n) => n.parentId === null)
    expect(roots.map((n) => n.title).sort()).toEqual(["Root One", "Root Two"])

    // All non-null parentIds point to valid nodes in the imported map
    for (const [, node] of nodesMap.entries()) {
      if (node.parentId !== null) {
        expect(nodesMap.has(node.parentId)).toBe(true)
      }
    }

    // Children of Root One end up under the same parent
    const rootOneId = Array.from(nodesMap.entries()).find(
      ([, n]) => n.title === "Root One",
    )![0]
    const children = Array.from(nodesMap.values()).filter(
      (n) => n.parentId === rootOneId,
    )
    expect(children.map((n) => n.title).sort()).toEqual(["Child One", "Child Two"])
  })

  it("preserves styles", async () => {
    const doc = makeDoc([
      {
        id: "n1",
        title: "Styled",
        style: { bold: true, color: "#ff0000", icon: "star" },
      },
    ])
    const outlineId = await seedOutline("Styles", doc)

    const zipBytes = await exportOutline(outlineId)
    const importedId = await importOutlineFromZip(zipBytes)

    const imported = await db.outlines.get(importedId)
    const [, node] = Array.from(getNodesMap(imported!.content).entries())[0]

    expect(node.style.bold).toBe(true)
    expect(node.style.color).toBe("#ff0000")
    expect(node.style.icon).toBe("star")
  })

  it("preserves order and collapsed", async () => {
    const doc = makeDoc([{ id: "n1", title: "A", order: 42, collapsed: true }])
    const outlineId = await seedOutline("Fields", doc)

    const zipBytes = await exportOutline(outlineId)
    const importedId = await importOutlineFromZip(zipBytes)

    const imported = await db.outlines.get(importedId)
    const [, node] = Array.from(getNodesMap(imported!.content).entries())[0]

    expect(node.order).toBe(42)
    expect(node.collapsed).toBe(true)
  })

  it("remaps node IDs — originals don't survive", async () => {
    const originalId = "aaaaaaaa-0000-0000-0000-000000000001"
    const doc = makeDoc([{ id: originalId, title: "Node" }])
    const outlineId = await seedOutline("Remap", doc)

    const zipBytes = await exportOutline(outlineId)
    const importedId = await importOutlineFromZip(zipBytes)

    const imported = await db.outlines.get(importedId)
    const nodesMap = getNodesMap(imported!.content)

    expect(nodesMap.has(originalId)).toBe(false)
    expect(nodesMap.size).toBe(1)
    expect(Array.from(nodesMap.values())[0].title).toBe("Node")
  })
})

// ---------------------------------------------------------------------------
// ZIP structure
// ---------------------------------------------------------------------------

describe("ZIP structure", () => {
  it("manifest contains version, name, createdAt, exportedAt", async () => {
    const doc = makeDoc([{ id: "a", title: "A" }])
    const outlineId = await seedOutline("Manifest Test", doc)

    const zipBytes = await exportOutline(outlineId)
    const unzipped = fflate.unzipSync(zipBytes)
    const manifest = JSON.parse(fflate.strFromU8(unzipped["manifest.json"]))

    expect(manifest.version).toBe(1)
    expect(manifest.name).toBe("Manifest Test")
    expect(typeof manifest.createdAt).toBe("number")
    expect(typeof manifest.exportedAt).toBe("number")
  })

  it("nodes.json contains all node records keyed by original ID", async () => {
    const doc = makeDoc([
      { id: "x", title: "X" },
      { id: "y", title: "Y" },
    ])
    const outlineId = await seedOutline("Nodes JSON", doc)

    const zipBytes = await exportOutline(outlineId)
    const unzipped = fflate.unzipSync(zipBytes)
    const nodes = JSON.parse(fflate.strFromU8(unzipped["nodes.json"]))

    expect(Object.keys(nodes)).toHaveLength(2)
    expect(nodes["x"].title).toBe("X")
    expect(nodes["y"].title).toBe("Y")
  })

  it("includes contents/nodeId for non-empty Y.Doc", async () => {
    const doc = makeDoc([{ id: "n1", title: "Node" }])
    // Seed nodeContents via the mock (put spy handles it)
    const contentDoc = new Y.Doc()
    contentDoc.getText("content").insert(0, "Hello world")
    await db.nodeContents.put({ nodeId: "n1", content: contentDoc } as any)

    const outlineId = await seedOutline("With Content", doc)
    const zipBytes = await exportOutline(outlineId)
    const unzipped = fflate.unzipSync(zipBytes)

    expect(unzipped["contents/n1"]).toBeDefined()
    expect(unzipped["contents/n1"].length).toBeGreaterThan(2)
  })

  it("omits contents/nodeId for empty Y.Doc", async () => {
    const doc = makeDoc([{ id: "n1", title: "Node" }])
    await db.nodeContents.put({ nodeId: "n1", content: new Y.Doc() } as any)

    const outlineId = await seedOutline("Empty Content", doc)
    const zipBytes = await exportOutline(outlineId)
    const unzipped = fflate.unzipSync(zipBytes)

    expect(unzipped["contents/n1"]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Content round-trip
// ---------------------------------------------------------------------------

describe("content round-trip", () => {
  it("restores rich text content into imported nodes", async () => {
    const doc = makeDoc([{ id: "n1", title: "Has Content" }])

    const contentDoc = new Y.Doc()
    contentDoc.getText("content").insert(0, "Hello world")
    await db.nodeContents.put({ nodeId: "n1", content: contentDoc } as any)

    const outlineId = await seedOutline("Content RT", doc)
    const zipBytes = await exportOutline(outlineId)
    const importedId = await importOutlineFromZip(zipBytes)

    // Find the imported node ID by title
    const imported = await db.outlines.get(importedId)
    const nodesMap = getNodesMap(imported!.content)
    const [newNodeId] = Array.from(nodesMap.entries()).find(
      ([, n]) => n.title === "Has Content",
    )!

    // The nodeContentDocMap should have the restored content
    const restoredDoc = nodeContentDocMap.get(newNodeId)
    expect(restoredDoc).toBeDefined()
    expect(restoredDoc!.getText("content").toString()).toBe("Hello world")
  })
})

// ---------------------------------------------------------------------------
// Image handling
// ---------------------------------------------------------------------------

const IMG_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const IMG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02])

async function seedOutlineWithImage(imageUuid: string, imageBytes: Uint8Array) {
  // Seed the image in db
  await db.images.put({
    id: imageUuid,
    blob: new Blob([imageBytes]),
    mimeType: "image/jpeg",
    size: imageBytes.length,
    createdAt: 999_000,
  })

  // Outline with one node whose content references the image
  const doc = makeDoc([{ id: "n1", title: "Image Node" }])
  const contentDoc = new Y.Doc()
  contentDoc.getText("content").insert(0, `![img](ol-image://${imageUuid})`)
  await db.nodeContents.put({ nodeId: "n1", content: contentDoc } as any)

  return seedOutline("Image Outline", doc)
}

describe("image handling", () => {
  it("bundles referenced images into the ZIP", async () => {
    const outlineId = await seedOutlineWithImage(IMG_UUID, IMG_BYTES)
    const zipBytes = await exportOutline(outlineId)
    const unzipped = fflate.unzipSync(zipBytes)

    const imagesMeta = JSON.parse(fflate.strFromU8(unzipped["images.json"]))
    expect(imagesMeta[IMG_UUID]).toBeDefined()
    expect(imagesMeta[IMG_UUID].mimeType).toBe("image/jpeg")
    expect(unzipped[`images/${IMG_UUID}`]).toBeDefined()
    expect(unzipped[`images/${IMG_UUID}`].length).toBe(IMG_BYTES.length)
  })

  it("inserts a new image when UUID is not in db", async () => {
    const outlineId = await seedOutlineWithImage(IMG_UUID, IMG_BYTES)
    const zipBytes = await exportOutline(outlineId)

    // Clear images so they appear "new" on import
    await db.images.clear()
    await importOutlineFromZip(zipBytes)

    const image = await db.images.get(IMG_UUID)
    expect(image).toBeDefined()
    expect(image!.mimeType).toBe("image/jpeg")
  })

  it("does not overwrite an existing image on re-import", async () => {
    const outlineId = await seedOutlineWithImage(IMG_UUID, IMG_BYTES)
    const zipBytes = await exportOutline(outlineId)

    // First import — image was already in db from seedOutlineWithImage
    await importOutlineFromZip(zipBytes)
    // Second import
    await importOutlineFromZip(zipBytes)

    const count = await db.images.count()
    // The outline images plus original — but all share same UUID, so just 1
    expect(count).toBe(1)

    // Original record untouched (createdAt not overwritten)
    const image = await db.images.get(IMG_UUID)
    expect(image!.createdAt).toBe(999_000)
  })

  it("preserves image UUID across export and import (no remapping)", async () => {
    const outlineId = await seedOutlineWithImage(IMG_UUID, IMG_BYTES)
    const zipBytes = await exportOutline(outlineId)

    await db.images.clear()
    const importedId = await importOutlineFromZip(zipBytes)

    // UUID unchanged — image is retrievable by original UUID
    const image = await db.images.get(IMG_UUID)
    expect(image).toBeDefined()

    // The imported node's content still references the original UUID
    const imported = await db.outlines.get(importedId)
    const nodesMap = getNodesMap(imported!.content)
    const [newNodeId] = Array.from(nodesMap.entries())[0]
    const restoredDoc = nodeContentDocMap.get(newNodeId)
    const text = restoredDoc?.getText("content").toString() ?? ""
    expect(text).toContain(IMG_UUID)
  })
})
