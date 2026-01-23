import { LitElement, html, css } from "lit"
import { customElement, state } from "lit/decorators.js"
import { InputController } from "../controller"
import { initStore, createNode, updateStyle } from "../store"
import { ReferenceElement } from "@floating-ui/dom"
import "@lit-labs/virtualizer"
import "./outline-row"
import "./popover"

@customElement("outline-view")
export class OutlineView extends LitElement {
  private ctrl = new InputController(this)

  @state() private contextMenuOpen = false
  @state() private contextMenuRef?: ReferenceElement
  @state() private contextMenuNodeId?: string

  static styles = css`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
      outline: none;
    }
    lit-virtualizer {
      height: 100%;
      width: 100%;
    }
  `

  connectedCallback() {
    super.connectedCallback()
    this.tabIndex = 0
    this.focus()
    this.addEventListener("keydown", this.handleKeyDown)
    this.addEventListener("click", (e) => {
      // Don't steal focus if clicking on an input
      const path = e.composedPath()
      const isInput = path.some((el) => (el as HTMLElement).tagName === "INPUT")
      if (!isInput) this.focus()
    })
    window.addEventListener("focus", this.handleWindowFocus)
    initStore()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener("keydown", this.handleKeyDown)
    window.removeEventListener("focus", this.handleWindowFocus)
  }

  handleWindowFocus = () => {
    // Only reclaim focus if we are in nav mode to avoid stealing from other inputs
    if (this.ctrl.mode === "nav") {
      this.focus()
    }
  }

  handleRowContextMenu = (e: CustomEvent) => {
    // e.detail contains { id, x, y }
    const { id, x, y } = e.detail
    this.contextMenuNodeId = id

    // Create a virtual element for the position
    this.contextMenuRef = {
      getBoundingClientRect() {
        return {
          width: 0,
          height: 0,
          x: x,
          y: y,
          top: y,
          left: x,
          right: x,
          bottom: y,
        }
      },
      contextElement: this, // optional but good practice
    }

    this.contextMenuOpen = true
  }

  toggleNodeStyle(key: "bold" | "italic" | "strikethrough") {
    if (!this.contextMenuNodeId) return

    // We need to toggle, so we should really get the current node...
    // simplified: Let the store handle toggle or just set true for now?
    // The user asked for "formatting options".

    // I need to look up the node to know current state if I want to toggle correctly toggle.
    const node = this.ctrl.flattenedNodes.find(
      (n) => n.id === this.contextMenuNodeId,
    )
    if (node) {
      const current = !!node.style[key]
      updateStyle(this.contextMenuNodeId, { [key]: !current })
    }
    this.contextMenuOpen = false
    this.focus()
  }

  handleKeyDown = (e: KeyboardEvent) => {
    this.ctrl.handleKeyDown(e)
  }

  startOutlining() {
    const id = createNode(null)
    this.ctrl.setActive(id)
    this.ctrl.setMode("insert")
  }

  render() {
    if (this.ctrl.flattenedNodes.length === 0) {
      return html`
        <div
          style="height:100%; display:flex; align-items:center; justify-content:center; flex-direction: column;"
        >
          <button
            @click=${this.startOutlining}
            style="padding: 10px 20px; font-size: 16px; cursor: pointer;"
          >
            Start outlining
          </button>
        </div>
      `
    }

    return html`
      <div style="height:100%">
        <lit-virtualizer
          .items=${this.ctrl.flattenedNodes}
          .renderItem=${(node: any) => html`
            <outline-row
              .node=${node}
              .isActive=${node.id === this.ctrl.activeId}
              .mode=${this.ctrl.mode}
              @row-click=${(e: CustomEvent) => {
                this.ctrl.setActive(e.detail)
                this.focus()
              }}
              @row-dblclick=${(e: CustomEvent) => {
                this.ctrl.setActive(e.detail)
                this.ctrl.setMode("insert")
              }}
              @row-contextmenu=${this.handleRowContextMenu}
              @update-title=${(e: CustomEvent) => {
                if (this.ctrl.activeId)
                  this.ctrl.updateTitle(this.ctrl.activeId, e.detail)
              }}
            ></outline-row>
          `}
        ></lit-virtualizer>
        
        <app-popover
            .open=${this.contextMenuOpen}
            .referenceElement=${this.contextMenuRef}
            placement="right-start" 
            strategy="fixed"
            @toggle=${(e: CustomEvent) => (this.contextMenuOpen = e.detail.open)}
            @click=${() => (this.contextMenuOpen = false)} 
            /* Close when click inside (selection made) */
        >
            <div style="display: flex; flex-direction: column; padding: 4px; gap: 2px;">
                <button style="text-align:left; border:none; background:none; padding: 6px 12px; cursor:pointer;" @click=${() => this.toggleNodeStyle("bold")}>Bold</button>
                <button style="text-align:left; border:none; background:none; padding: 6px 12px; cursor:pointer;" @click=${() => this.toggleNodeStyle("italic")}>Italic</button>
                <button style="text-align:left; border:none; background:none; padding: 6px 12px; cursor:pointer;" @click=${() => this.toggleNodeStyle("strikethrough")}>Strikethrough</button>
            </div>
        </app-popover>
      </div>
    `
  }
}
