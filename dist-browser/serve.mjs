import { build } from "vite";
import { createServer } from "./server.mjs";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function main() {
  // Build the frontend
  await build({
    root: __dirname,
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  });

  const { start, stop } = createServer();

  await start();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
