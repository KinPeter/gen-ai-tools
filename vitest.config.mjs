import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["test/**/*.test.{mjs,jsx,tsx}"],
    isolate: true,
    setupFiles: ["./test/support/setup.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "comfyui/**/*.mjs",
        "runpod/**/*.mjs",
        "logging/**/*.mjs",
        "tools-hub/**/*.mjs",
      ],
      thresholds: {
        perFile: true,
        lines: 90,
      },
      exclude: [
        "**/node_modules/**",
        "**/test/**",
        "**/output/**",
        "**/dist/**",
        "**/.tmp/**",
        "**/workflows/*.json",
        "**/logging/temp-scripts/**",
        "**/tools-hub/index.mjs",
      ],
    },
  },
});
