import { db } from "../store"

const objectURLCache = new Map<string, string>()

export async function saveImage(file: File): Promise<string> {
  const id = crypto.randomUUID()
  await db.images.add({
    id,
    blob: file,
    mimeType: file.type,
    size: file.size,
    createdAt: Date.now(),
  })
  return id
}

export async function getImageURL(id: string): Promise<string | null> {
  const cached = objectURLCache.get(id)
  if (cached) return cached

  const row = await db.images.get(id)
  if (!row) return null

  const url = URL.createObjectURL(row.blob)
  objectURLCache.set(id, url)
  return url
}

export function getCachedImageURL(id: string): string | undefined {
  return objectURLCache.get(id)
}

export async function preCacheImagesFromText(text: string): Promise<void> {
  const ids = [...text.matchAll(/ol-image:\/\/([a-f0-9-]+)/g)].map((m) => m[1])
  await Promise.all(ids.map(getImageURL))
}

export function revokeAll(): void {
  for (const url of objectURLCache.values()) {
    URL.revokeObjectURL(url)
  }
  objectURLCache.clear()
}
