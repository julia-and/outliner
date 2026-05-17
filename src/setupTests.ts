import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// @testing-library/react@16 only auto-cleans when Vitest is run with globals;
// our config has `globals: false`, so register cleanup explicitly to keep DOM
// state isolated between tests.
afterEach(() => {
  cleanup()
})
