import { execSync } from "child_process"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { lingui } from "@lingui/vite-plugin"
import { VitePWA } from "vite-plugin-pwa"

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim()
  } catch {
    return "dev"
  }
})()

// Inject a strict CSP meta tag only in production builds — dev needs HMR ws
// and 'unsafe-eval', which we deliberately don't allow in the shipped app.
function csp(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.dexie.cloud wss://*.dexie.cloud",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ")
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</head>",
        `    <meta http-equiv="Content-Security-Policy" content="${policy}">\n  </head>`,
      )
    },
  }
}

// Tauri sets TAURI_ENV_* during its before{Dev,Build}Command hooks. In the
// native shell the assets are already local, so the service worker (offline
// caching) is redundant and Tauri owns the CSP — skip both PWA and the meta CSP.
const isTauri = !!process.env.TAURI_ENV_PLATFORM

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __IS_TAURI__: JSON.stringify(isTauri),
  },
  plugins: [
    lingui(),
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    ...(isTauri
      ? []
      : [
          VitePWA({
            injectRegister: false,
            strategies: "injectManifest",
            srcDir: "src",
            filename: "sw.ts",
            manifest: false,
            injectManifest: {
              maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
          }),
          csp(),
        ]),
  ],
  build: {
    target: "esnext",
  },
})
