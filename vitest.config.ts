import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/utils/**", "src/store.ts", "src/hooks/useOutline.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
})
