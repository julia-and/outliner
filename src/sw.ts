/// <reference lib="webworker" />
import "dexie-cloud-addon/service-worker"
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching"

declare const self: ServiceWorkerGlobalScope

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.clients.claim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
