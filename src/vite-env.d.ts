/// <reference types="vite/client" />

declare const __COMMIT_HASH__: string
declare const __IS_TAURI__: boolean

declare module "*.po" {
  import type { Messages } from "@lingui/core"
  export const messages: Messages
}
