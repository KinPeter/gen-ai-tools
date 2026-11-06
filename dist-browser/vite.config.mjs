import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { DIST_BROWSER_UI_BASE_PATH } from "../tools-hub/utils/constants.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: resolve(__dirname),
  // Production builds are served by tools-hub under /distbrowser; the Vite
  // dev server keeps serving the app from the root.
  base: command === "build" ? DIST_BROWSER_UI_BASE_PATH : "/",
  server: {
    proxy: {
      // The dist-browser API is served by tools-hub, so the Vite dev server
      // forwards API requests to it.
      "/api": {
        target: `http://localhost:${process.env.TOOLS_HUB_PORT || 4218}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
