import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin"

export default defineConfig({
  plugins: [
    lingui(),
    react(),
    babel({ presets: [linguiTransformerBabelPreset()] }),
  ],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/setupTests.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/utils/**", "src/store.ts", "src/hooks/useOutline.ts"],
      exclude: ["src/**/*.test.{ts,tsx}"],
    },
  },
})
