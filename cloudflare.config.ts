import { defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "nostr-me",
    compatibilityDate: "2026-10-10",
    assets: {
      notFoundHandling: "single-page-application",
    },
    domains: ["nostr-me.isksss.dev"],
  }),
});
