import { LitElement, html, css, PropertyValues } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { OutletNode } from "../types"

@customElement("outline-row")
export class OutlineRow extends LitElement {
  @property({ type: Object }) node!: OutletNode
  @property({ type: Boolean }) isActive = false
  @property({ type: String }) mode: "nav" | "insert" = "nav"

  @query("input") inputEl!: HTMLInputElement

  static styles = css`
    :host {
      display: block;
      font-family: system-ui;
      font-size: 14px;
      box-sizing: border-box;
      /* Define grid template variable for easy column management */
      --grid-template: 1fr;
      min-width: 100%;
    }
    .row {
      width: 100%;
      display: grid;
      grid-template-columns: var(--grid-template);
      align-items: center;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      box-sizing: border-box;
    }
    .main-column {
      display: flex; /* Flex is used inside the grid cell for content layout (indent + bullet + title) */
      align-items: center;
      min-width: 0;
    }
    .row.active {
      background: #e3f2fd;
      color: #333;
    }
    .bullet {
      width: 8px;
      height: 8px;
      background: #ccc;
      border-radius: 50%;
      margin-right: 12px;
      flex-shrink: 0;
    }
    .bullet.has-children {
      background: #666;
    }
    input {
      font: inherit;
      width: 100%;
      border: none;
      background: transparent;
      color: #333;
      outline: none;
    }
  `

  updated(changedProperties: PropertyValues) {
    if (this.isActive && this.mode === "insert" && this.inputEl) {
      this.inputEl.focus()
      this.inputEl.select()
    }
  }

  render() {
    console.count("render row")

    const s = this.node.style

    // Row style: Background, color, font
    const rowStyle = `
      ${s.bold ? "font-weight: 700;" : ""}
      ${s.italic ? "font-style: italic;" : ""}
      ${s.strikethrough ? "text-decoration: line-through;" : ""}
      ${s.color ? `color: ${s.color};` : ""}
      ${s.backgroundColor ? `background-color: ${s.backgroundColor};` : ""}
    `

    // Indent appled to the main column wrapper
    const indentStyle = `padding-left: ${this.node.depth * 16}px;`

    return html`
      <div
        class="row ${this.isActive ? "active" : ""}"
        style="${rowStyle}"
        @click=${() =>
          this.dispatchEvent(
            new CustomEvent("row-click", { detail: this.node.id }),
          )}
        @dblclick=${() =>
          this.dispatchEvent(
            new CustomEvent("row-dblclick", { detail: this.node.id }),
          )}
        @contextmenu=${(e: MouseEvent) => {
          e.preventDefault()
          this.dispatchEvent(
            new CustomEvent("row-contextmenu", {
              detail: {
                id: this.node.id,
                x: e.clientX,
                y: e.clientY,
              },
            }),
          )
        }}
      >
        <!-- The Main "Tree" Column -->
        <div class="main-column" style="${indentStyle}">
          <div
            class="bullet ${this.node.hasChildren ? "has-children" : ""}"
          ></div>
          <div style="flex: 1">
            ${this.isActive && this.mode === "insert"
              ? html`<input
                  .value=${this.node.title}
                  @click=${(e: Event) => e.stopPropagation()}
                  @dblclick=${(e: Event) => e.stopPropagation()}
                  @input=${(e: any) =>
                    this.dispatchEvent(
                      new CustomEvent("update-title", {
                        detail: e.target.value,
                      }),
                    )}
                  @keydown=${(e: KeyboardEvent) => {
                    // event bubbling...
                  }}
                />`
              : html`<span
                  >${this.node.title ||
                  html`<span style="opacity:0.5">New Item</span>`}</span
                >`}
          </div>
        </div>

        <!-- Future columns can be added here as sibling divs -->
      </div>
    `
  }
}
