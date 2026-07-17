import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "src/locales/**", "src-tauri"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        __COMMIT_HASH__: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Classic react-hooks rules only. eslint-plugin-react-hooks@7 also
      // ships React Compiler checks under its recommended preset; we leave
      // those off until a deliberate compiler-readiness effort.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Allow underscore-prefixed names to be intentionally unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Milkdown/ProseMirror plugin authoring relies heavily on framework
    // types that surface as `any` upstream; typing them tightly is a
    // separate effort beyond Wave 2's lint enablement.
    files: ["src/editor/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Tests can use `any` for fixtures and may import helpers conditionally.
    files: ["**/*.test.{ts,tsx}", "src/**/setupTests.ts"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Node-context files
    files: ["vite.config.ts", "lingui.config.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
