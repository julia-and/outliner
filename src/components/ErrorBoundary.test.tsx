import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import userEvent from "@testing-library/user-event"
import { screen } from "@testing-library/react"
import { useState } from "react"
import { renderWithI18n } from "../testUtils"
import { ErrorBoundary } from "./ErrorBoundary"

const Boom = ({ explode }: { explode: boolean }) => {
  if (explode) throw new Error("kaboom")
  return <div>safe child</div>
}

const Harness = ({ initialExplode }: { initialExplode: boolean }) => {
  const [explode, setExplode] = useState(initialExplode)
  return (
    <ErrorBoundary>
      <button onClick={() => setExplode(false)}>defuse</button>
      <Boom explode={explode} />
    </ErrorBoundary>
  )
}

describe("ErrorBoundary", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // React logs the caught error to console.error; silence it for the
    // duration of these tests so the test output stays clean.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it("renders children when no error is thrown", () => {
    renderWithI18n(<Harness initialExplode={false} />)
    expect(screen.getByText("safe child")).toBeDefined()
  })

  it("renders the fallback when a child throws, and Retry resets the boundary", async () => {
    const user = userEvent.setup()
    renderWithI18n(<Harness initialExplode={true} />)

    // Fallback is visible; safe child is not
    expect(
      screen.getByText("The editor crashed — your data is safe."),
    ).toBeDefined()
    expect(screen.queryByText("safe child")).toBeNull()

    // The "defuse" button lives inside the boundary's subtree, which the
    // fallback replaces — it should be absent until Retry recreates it.
    expect(screen.queryByRole("button", { name: "defuse" })).toBeNull()

    // Retry without first defusing → Boom throws again → fallback persists
    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(
      screen.getByText("The editor crashed — your data is safe."),
    ).toBeDefined()
  })
})
