import { LitElement, html, css, PropertyValueMap } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import {
  computePosition,
  autoUpdate,
  flip,
  shift,
  offset,
  arrow,
  Placement,
  Strategy,
  Middleware,
  ReferenceElement,
} from "@floating-ui/dom"

@customElement("app-popover")
export class AppPopover extends LitElement {
  @property({ attribute: false })
  referenceElement?: ReferenceElement

  @property({ type: Boolean, reflect: true })
  open = false

  @property({ type: String })
  placement: Placement = "bottom-start"

  @property({ type: String })
  strategy: Strategy = "absolute"

  @property({ type: Number })
  offset = 4

  @query("#arrow")
  arrowElement!: HTMLElement | null

  private cleanup?: () => void

  static styles = css`
    :host {
      display: inline-block;
    }

    #trigger-container {
      display: contents;
      cursor: pointer;
    }

    #content-container {
      display: none;
      width: max-content;
      z-index: 1000;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    :host([open]) #content-container {
      display: block;
    }

    #arrow {
      position: absolute;
      background: white;
      width: 8px;
      height: 8px;
      transform: rotate(45deg);
    }
  `

  toggle() {
    this.open = !this.open
    this.dispatchToggle()
  }

  close() {
    this.open = false
    this.dispatchToggle()
  }

  private dispatchToggle() {
    this.dispatchEvent(
      new CustomEvent("toggle", {
        detail: { open: this.open },
        bubbles: true,
        composed: true,
      }),
    )
  }

  updated(changedProperties: PropertyValueMap<any>) {
    if (changedProperties.has("open")) {
      if (this.open) {
        this.startFloating()
        // Add click outside listener
        setTimeout(() => {
          document.addEventListener("click", this.handleDocumentClick)
          document.addEventListener("contextmenu", this.handleDocumentClick)
        }, 0)
      } else {
        this.stopFloating()
        document.removeEventListener("click", this.handleDocumentClick)
        document.removeEventListener("contextmenu", this.handleDocumentClick)
      }
    } else if (
      this.open &&
      (changedProperties.has("placement") ||
        changedProperties.has("offset") ||
        changedProperties.has("strategy") ||
        changedProperties.has("referenceElement"))
    ) {
      this.updatePosition()
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopFloating()
    document.removeEventListener("click", this.handleDocumentClick)
    document.removeEventListener("contextmenu", this.handleDocumentClick)
  }

  private handleDocumentClick = (e: MouseEvent) => {
    // If we're clicking the reference element (like right click again), we might want to handle that differently
    // but for now, rely on parent to update the reference if needed.
    const path = e.composedPath()
    if (!path.includes(this)) {
      // Did we click the virtual reference? We can't know easily.
      // But generally if we click outside the popover content, we close.
      // Unless we clicked the trigger slot element.

      const trigger = this.getTriggerElement()
      if (trigger instanceof Element && path.includes(trigger)) {
        return
      }

      this.close()
    }
  }

  private getTriggerElement(): ReferenceElement | undefined {
    if (this.referenceElement) return this.referenceElement

    // Assuming the first assigned element in 'trigger' slot is the trigger
    const slot = this.shadowRoot?.querySelector(
      'slot[name="trigger"]',
    ) as HTMLSlotElement
    return slot?.assignedElements({ flatten: true })[0] as HTMLElement
  }

  private getContentElement(): HTMLElement | null {
    return this.shadowRoot!.getElementById("content-container")
  }

  private startFloating() {
    const trigger = this.getTriggerElement()
    const content = this.getContentElement()

    if (!trigger || !content) return

    this.cleanup = autoUpdate(trigger, content, () => {
      this.updatePosition()
    })
  }

  private updatePosition() {
    const trigger = this.getTriggerElement()
    const content = this.getContentElement()

    if (!trigger || !content) return

    const middleware: Middleware[] = [
      offset(this.offset),
      flip(),
      shift({ padding: 5 }),
    ]

    if (this.arrowElement) {
      middleware.push(arrow({ element: this.arrowElement }))
    }

    computePosition(trigger, content, {
      placement: this.placement,
      middleware,
      strategy: this.strategy,
    }).then(({ x, y, placement, middlewareData }) => {
      Object.assign(content.style, {
        left: `${x}px`,
        top: `${y}px`,
        position: this.strategy,
      })

      if (this.arrowElement && middlewareData.arrow) {
        const { x: arrowX, y: arrowY } = middlewareData.arrow

        const staticSide = {
          top: "bottom",
          right: "left",
          bottom: "top",
          left: "right",
        }[placement.split("-")[0]]

        Object.assign(this.arrowElement.style, {
          left: arrowX != null ? `${arrowX}px` : "",
          top: arrowY != null ? `${arrowY}px` : "",
          right: "",
          bottom: "",
          [staticSide!]: "-4px",
        })
      }
    })
  }

  private stopFloating() {
    if (this.cleanup) {
      this.cleanup()
      this.cleanup = undefined
    }
  }

  render() {
    return html`
      <div id="trigger-container" @click=${this.toggle}>
        <slot name="trigger"></slot>
      </div>
      <div id="content-container">
        <!-- <div id="arrow"></div> -->
        <slot></slot>
      </div>
    `
  }
}
