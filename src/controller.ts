import { ReactiveController, ReactiveControllerHost } from "lit"
import {
  flattenNodes,
  yDoc,
  addSibling,
  addRootSibling,
  addChild,
  toggleCollapse,
  deleteNode,
  moveNode,
  indentNode,
  outdentNode,
  updateTitle,
} from "./store"
import { isCmd } from "./utils/keyboard"
import { OutletNode } from "./types"

export class InputController implements ReactiveController {
  mode: "nav" | "insert" = "nav"
  activeId: string | null = null
  flattenedNodes: OutletNode[] = []
  private originalTitle: string | null = null

  constructor(private host: ReactiveControllerHost) {
    host.addController(this)
    yDoc.on("update", (_update: any, origin: any) => {
      if (origin !== "user-typing") this.refresh()
    })
  }

  hostConnected() {
    this.refresh()
  }

  refresh() {
    this.flattenedNodes = flattenNodes()
    // Auto-select first if needed
    if (!this.activeId && this.flattenedNodes.length) {
      this.activeId = this.flattenedNodes[0].id
    }
    this.host.requestUpdate()
  }

  setActive(id: string) {
    this.activeId = id
    this.host.requestUpdate()
  }

  setMode(m: "nav" | "insert") {
    if (m === "insert") {
      const node = this.flattenedNodes.find((n) => n.id === this.activeId)
      this.originalTitle = node ? node.title : ""
    } else {
      this.originalTitle = null
    }
    this.mode = m
    this.host.requestUpdate()
    if (m === "nav") {
      ;(this.host as HTMLElement).focus()
    }
  }

  updateTitle(id: string, text: string) {
    const node = this.flattenedNodes.find((n) => n.id === id)
    if (node) {
      node.title = text
    }
    updateTitle(id, text, "user-typing")
  }

  handleKeyDown(e: KeyboardEvent) {
    const idx = this.flattenedNodes.findIndex((n) => n.id === this.activeId)

    // INSERT MODE
    if (this.mode === "insert") {
      if (e.key === "Escape") {
        e.preventDefault()
        // Revert to original title if it exists
        if (this.activeId && this.originalTitle !== null) {
          this.updateTitle(this.activeId, this.originalTitle)
        }
        this.setMode("nav")
      } else if (e.key === "Enter") {
        e.preventDefault()
        this.setMode("nav")
        if (this.activeId) {
          // const newId = isCmd(e)
          //   ? addChild(this.activeId)
          //   : addSibling(this.activeId);
          // this.activeId = newId;
          // Remain in insert mode for the new node
        }
      }
      return
    }

    // NAV MODE
    if (this.mode === "nav") {
      const node = this.flattenedNodes[idx]

      if (isCmd(e)) {
        if (e.key === "ArrowUp") {
          e.preventDefault()
          if (this.activeId) moveNode(this.activeId, "up")
          return
        }
        if (e.key === "ArrowDown") {
          e.preventDefault()
          if (this.activeId) moveNode(this.activeId, "down")
          return
        }
        if (e.key === "ArrowRight") {
          e.preventDefault()
          if (this.activeId) indentNode(this.activeId)
          return
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          if (this.activeId) outdentNode(this.activeId)
          return
        }
      }

      if (e.key === "Tab") {
        e.preventDefault()
        if (this.activeId) {
          if (e.shiftKey) outdentNode(this.activeId)
          else indentNode(this.activeId)
        }
        return
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault()
          if (isCmd(e) && this.activeId) {
            moveNode(this.activeId, "up")
            return
          }
          if (idx > 0) this.setActive(this.flattenedNodes[idx - 1].id)
          break
        case "ArrowDown":
          e.preventDefault()
          if (isCmd(e) && this.activeId) {
            moveNode(this.activeId, "down")
            return
          }
          if (idx < this.flattenedNodes.length - 1)
            this.setActive(this.flattenedNodes[idx + 1].id)
          break
        case "ArrowRight":
          e.preventDefault()
          if (isCmd(e) && this.activeId) {
            indentNode(this.activeId)
            return
          }
          if (node?.hasChildren && node.collapsed) toggleCollapse(node.id)
          break
        case "ArrowLeft":
          e.preventDefault()
          if (isCmd(e) && this.activeId) {
            outdentNode(this.activeId)
            return
          }
          if (node?.hasChildren && !node.collapsed) toggleCollapse(node.id)
          else {
            // Logic to jump to parent could go here
            // Simple logic: look backwards for depth - 1
            for (let i = idx - 1; i >= 0; i--) {
              if (this.flattenedNodes[i].depth < node.depth) {
                this.setActive(this.flattenedNodes[i].id)
                break
              }
            }
          }
          break
        case "Enter":
          e.preventDefault()
          if (isCmd(e) && e.shiftKey && this.activeId) {
            this.setActive(addRootSibling(this.activeId))
            this.setMode("insert")
            return
          }
          if (isCmd(e) && this.activeId) {
            this.setActive(addChild(this.activeId))
            this.setMode("insert")
          } else if (this.activeId) {
            this.setActive(addSibling(this.activeId))
            this.setMode("insert")
          }
          break
        case "i":
          e.preventDefault()
          this.setMode("insert")
          break
        case "Backspace":
          if (this.activeId) {
            let nextId = null
            const nodeToDelete = this.flattenedNodes[idx]

            if (idx > 0) {
              // Select the node visually ABOVE (idx - 1).
              // This is safe because it cannot be a child of the deleted node.
              nextId = this.flattenedNodes[idx - 1].id
            } else if (idx < this.flattenedNodes.length - 1) {
              // If deleting the first item, try to select the next valid sibling.
              // Use find() to skip any children of the deleted node (which will also vanish).
              const found = this.flattenedNodes
                .slice(idx + 1)
                .find((n) => n.depth <= nodeToDelete.depth)
              if (found) nextId = found.id
            }

            const idToDelete = this.activeId
            if (nextId) this.setActive(nextId)
            deleteNode(idToDelete)
          }
          break
      }
    }
  }
}
