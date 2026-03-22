import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
  ],
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
