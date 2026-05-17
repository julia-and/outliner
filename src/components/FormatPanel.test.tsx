import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { screen } from "@testing-library/react"
import { renderWithI18n } from "../testUtils"
import { FormatPanel } from "./FormatPanel"
import { NodeStyle } from "../types"

const baseProps = {
  nodeStyle: {} as NodeStyle,
  hasChildren: true,
  onToggle: vi.fn(),
  onClearFormat: vi.fn(),
  onSetColor: vi.fn(),
  onSetBackground: vi.fn(),
  onApplyPreset: vi.fn(),
}

describe("FormatPanel", () => {
  it("calls onToggle with recursive=false on a plain click", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    renderWithI18n(<FormatPanel {...baseProps} onToggle={onToggle} />)

    await user.click(screen.getByRole("button", { name: "B" }))

    expect(onToggle).toHaveBeenCalledExactlyOnceWith("bold", false)
  })

  it("calls onToggle with recursive=true on Shift+click", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    renderWithI18n(<FormatPanel {...baseProps} onToggle={onToggle} />)

    await user.keyboard("{Shift>}")
    await user.click(screen.getByRole("button", { name: "I" }))
    await user.keyboard("{/Shift}")

    expect(onToggle).toHaveBeenCalledExactlyOnceWith("italic", true)
  })
})
