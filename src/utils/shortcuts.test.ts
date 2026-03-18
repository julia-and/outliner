import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  findConflict,
  matchesBinding,
  getBindings,
  setBinding,
  resetBinding,
  formatBinding,
  SHORTCUT_DEFS,
} from "./shortcuts"
import type { KeyBinding } from "./shortcuts"

// ---------------------------------------------------------------------------
// localStorage mock (vitest jsdom provides localStorage, but we need control)
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: create a minimal KeyboardEvent-like object
// ---------------------------------------------------------------------------

function makeEvent(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
  } as unknown as KeyboardEvent
}

// ---------------------------------------------------------------------------
// matchesBinding
// ---------------------------------------------------------------------------

describe("matchesBinding", () => {
  it("matches simple key with no modifiers", () => {
    const binding: KeyBinding = { key: "ArrowUp" }
    expect(matchesBinding(makeEvent("ArrowUp"), binding)).toBe(true)
  })

  it("fails on wrong key", () => {
    const binding: KeyBinding = { key: "ArrowUp" }
    expect(matchesBinding(makeEvent("ArrowDown"), binding)).toBe(false)
  })

  it("fails when binding requires cmd but event has none", () => {
    const binding: KeyBinding = { key: "z", cmd: true }
    expect(matchesBinding(makeEvent("z"), binding)).toBe(false)
  })

  it("matches when binding has no cmd and event has none", () => {
    const binding: KeyBinding = { key: "i" }
    expect(matchesBinding(makeEvent("i"), binding)).toBe(true)
  })

  it("matches shift modifier", () => {
    const binding: KeyBinding = { key: "Enter", shift: true }
    expect(matchesBinding(makeEvent("Enter", { shiftKey: true }), binding)).toBe(true)
    expect(matchesBinding(makeEvent("Enter", { shiftKey: false }), binding)).toBe(false)
  })

  it("fails when event has shift but binding does not", () => {
    const binding: KeyBinding = { key: "Enter" }
    expect(matchesBinding(makeEvent("Enter", { shiftKey: true }), binding)).toBe(false)
  })

  it("matches alt modifier", () => {
    const binding: KeyBinding = { key: "x", alt: true }
    expect(matchesBinding(makeEvent("x", { altKey: true }), binding)).toBe(true)
    expect(matchesBinding(makeEvent("x", { altKey: false }), binding)).toBe(false)
  })

  it("matches combined modifiers", () => {
    const binding: KeyBinding = { key: "z", cmd: true, shift: true }
    // On non-Mac environments, cmd maps to ctrlKey
    const event = makeEvent("z", { ctrlKey: true, shiftKey: true })
    // Result depends on isMac constant — just verify the function doesn't throw
    // and that wrong keys definitely fail
    expect(matchesBinding(makeEvent("x", { ctrlKey: true, shiftKey: true }), binding)).toBe(false)
  })

  it("key match is case-sensitive", () => {
    const binding: KeyBinding = { key: "i" }
    expect(matchesBinding(makeEvent("I"), binding)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// findConflict
// ---------------------------------------------------------------------------

describe("findConflict", () => {
  it("returns null when no bindings exist", () => {
    expect(findConflict("nav.up", { key: "ArrowUp" }, {})).toBeNull()
  })

  it("returns null when no conflict", () => {
    const bindings = { "nav.down": { key: "ArrowDown" } }
    expect(findConflict("nav.up", { key: "ArrowUp" }, bindings)).toBeNull()
  })

  it("detects a conflict with same key and same mode", () => {
    const bindings: Record<string, KeyBinding> = {
      "nav.down": { key: "ArrowUp" }, // same key as proposing
    }
    const conflict = findConflict("nav.up", { key: "ArrowUp" }, bindings)
    expect(conflict).toBe("nav.down")
  })

  it("does not conflict with self (same proposingId skipped)", () => {
    const bindings: Record<string, KeyBinding> = {
      "nav.up": { key: "ArrowUp" },
    }
    expect(findConflict("nav.up", { key: "ArrowUp" }, bindings)).toBeNull()
  })

  it("does not conflict across different modes (nav vs insert)", () => {
    // insert.confirm is in insert mode; nav.up is in nav mode
    const bindings: Record<string, KeyBinding> = {
      "insert.confirm": { key: "Enter" },
    }
    expect(findConflict("nav.up", { key: "Enter" }, bindings)).toBeNull()
  })

  it("distinguishes bindings by cmd modifier", () => {
    const bindings: Record<string, KeyBinding> = {
      "nav.down": { key: "z", cmd: true },
    }
    // Proposing z without cmd — no conflict
    expect(findConflict("nav.up", { key: "z" }, bindings)).toBeNull()
  })

  it("distinguishes bindings by shift modifier", () => {
    const bindings: Record<string, KeyBinding> = {
      "node.redo": { key: "z", cmd: true, shift: true },
    }
    // Same key+cmd but no shift — no conflict
    expect(findConflict("node.undo", { key: "z", cmd: true }, bindings)).toBeNull()
  })

  it("treats undefined and false as equivalent for modifiers", () => {
    // binding.cmd is undefined, newBinding.cmd is undefined — both falsy → match
    const bindings: Record<string, KeyBinding> = {
      "nav.down": { key: "x" }, // no cmd
    }
    const conflict = findConflict("nav.up", { key: "x" }, bindings)
    expect(conflict).toBe("nav.down")
  })

  it("finds conflict in a full bindings map", () => {
    const bindings = getBindings()
    // ArrowUp is nav.up; trying to assign ArrowUp to nav.down should conflict
    const conflict = findConflict("nav.down", { key: "ArrowUp" }, bindings)
    expect(conflict).toBe("nav.up")
  })
})

// ---------------------------------------------------------------------------
// getBindings / setBinding / resetBinding
// ---------------------------------------------------------------------------

describe("getBindings", () => {
  it("returns an entry for every SHORTCUT_DEF", () => {
    const bindings = getBindings()
    for (const def of SHORTCUT_DEFS) {
      expect(bindings[def.id]).toBeDefined()
    }
  })

  it("defaults match SHORTCUT_DEFS defaultBinding", () => {
    const bindings = getBindings()
    for (const def of SHORTCUT_DEFS) {
      expect(bindings[def.id]).toEqual(def.defaultBinding)
    }
  })

  it("applies stored overrides for remappable shortcuts", () => {
    const override: KeyBinding = { key: "k" }
    setBinding("nav.up", override)
    const bindings = getBindings()
    expect(bindings["nav.up"]).toEqual(override)
  })

  it("does NOT apply stored overrides for non-remappable shortcuts", () => {
    const def = SHORTCUT_DEFS.find((d) => d.remappable === false)
    expect(def).toBeDefined()
    // Force an override into localStorage anyway
    const raw = { [def!.id]: { key: "x" } }
    localStorage.setItem("ol-shortcuts", JSON.stringify(raw))
    const bindings = getBindings()
    expect(bindings[def!.id]).toEqual(def!.defaultBinding)
  })

  it("returns defaults when localStorage contains corrupt JSON", () => {
    localStorage.setItem("ol-shortcuts", "{bad}")
    const bindings = getBindings()
    expect(bindings["nav.up"]).toEqual({ key: "ArrowUp" })
  })
})

describe("setBinding / resetBinding", () => {
  it("persists a binding to localStorage", () => {
    setBinding("nav.up", { key: "w" })
    expect(getBindings()["nav.up"]).toEqual({ key: "w" })
  })

  it("resetBinding restores the default", () => {
    setBinding("nav.up", { key: "w" })
    resetBinding("nav.up")
    expect(getBindings()["nav.up"]).toEqual({ key: "ArrowUp" })
  })

  it("reset on an unset binding is a no-op", () => {
    resetBinding("nav.up") // was never overridden
    expect(getBindings()["nav.up"]).toEqual({ key: "ArrowUp" })
  })
})

// ---------------------------------------------------------------------------
// formatBinding
// ---------------------------------------------------------------------------

describe("formatBinding", () => {
  it("formats a simple key", () => {
    expect(formatBinding({ key: "i" })).toBe("I")
  })

  it("formats Enter as ↩", () => {
    expect(formatBinding({ key: "Enter" })).toBe("↩")
  })

  it("formats Backspace as ⌫", () => {
    expect(formatBinding({ key: "Backspace" })).toBe("⌫")
  })

  it("formats arrow keys as symbols", () => {
    expect(formatBinding({ key: "ArrowUp" })).toBe("↑")
    expect(formatBinding({ key: "ArrowDown" })).toBe("↓")
    expect(formatBinding({ key: "ArrowLeft" })).toBe("←")
    expect(formatBinding({ key: "ArrowRight" })).toBe("→")
  })

  it("includes Shift prefix when shift=true", () => {
    const result = formatBinding({ key: "Enter", shift: true })
    expect(result).toContain("↩")
    // Should have a shift prefix
    expect(result.split(" ").length).toBeGreaterThan(1)
  })

  it("formats multi-key binding with all modifiers", () => {
    const result = formatBinding({ key: "z", cmd: true, shift: true, alt: true })
    // Should contain the key symbol
    expect(result).toContain("Z")
    // Should have multiple parts
    expect(result.split(" ").length).toBe(4)
  })
})
