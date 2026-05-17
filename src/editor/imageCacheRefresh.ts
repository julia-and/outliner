import { useEffect } from "react"
import { liveQuery } from "dexie"
import { editorViewCtx } from "@milkdown/kit/core"
import type { Ctx } from "@milkdown/kit/ctx"
import { db } from "../store"
import { getCachedImageURL, getImageURL } from "../utils/imageStore"

type GetInstance = () =>
  | { action: (cb: (ctx: Ctx) => void) => void }
  | undefined

// Subscribes to the local images table. When a new image arrives (via cloud
// sync), pre-caches its blob URL and then dispatches a setNodeMarkup
// transaction on any image nodes still pointing at `ol-image://<id>` — this
// re-triggers Crepe's `proxyDomURL` callback, which now finds the cached
// blob URL and replaces the placeholder.
export function useImageCacheRefresh(
  loading: boolean,
  get: GetInstance,
): void {
  useEffect(() => {
    if (loading) return
    const sub = liveQuery(() => db.images.toArray()).subscribe(async (rows) => {
      const uncached = rows.filter((r) => !getCachedImageURL(r.id))
      if (uncached.length === 0) return
      await Promise.all(uncached.map((r) => getImageURL(r.id)))
      get()?.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        let tr = view.state.tr
        view.state.doc.descendants((node, pos) => {
          if (
            typeof node.attrs?.src !== "string" ||
            !node.attrs.src.startsWith("ol-image://")
          )
            return
          if (
            !getCachedImageURL(node.attrs.src.slice("ol-image://".length))
          )
            return
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs })
        })
        view.dispatch(tr)
      })
    })
    return () => sub.unsubscribe()
    // `get` is stable for the lifetime of MilkdownProvider, intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
}
