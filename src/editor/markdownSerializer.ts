import { schemaCtx, serializerCtx } from "@milkdown/kit/core"
import { Node } from "@milkdown/prose/model"
import { buildCrepeEditor } from "./crepeConfig"
import type { PMJson } from "../utils/markdownExport"

// Hidden Crepe instance used only for its schema + markdown serializer, so
// exports share the exact schema of the real editor (callout, highlight,
// placeholder, nodeLink toMarkdown extensions included). One instance per
// copy action; call destroy() when done.
export async function createMarkdownSerializer(): Promise<{
  serialize: (json: PMJson) => string
  destroy: () => Promise<void>
}> {
  const root = document.createElement("div")
  root.style.display = "none"
  document.body.appendChild(root)

  const noop = () => {}
  const crepe = buildCrepeEditor({
    root,
    onTriggerRef: { current: noop },
    onKeyRef: { current: noop },
    nodeLinkTypeRef: { current: null },
    onNavigateRef: { current: noop },
    onCalloutPickerRef: { current: noop },
    onCountsChange: noop,
    onSelectionChange: noop,
  })

  try {
    await crepe.create()
  } catch (err) {
    root.remove()
    throw err
  }

  const ctx = crepe.editor.ctx
  const schema = ctx.get(schemaCtx)
  const serializer = ctx.get(serializerCtx)

  return {
    serialize: (json) => serializer(Node.fromJSON(schema, json)),
    destroy: async () => {
      await crepe.destroy()
      root.remove()
    },
  }
}
