import "dotenv/config";

import { fileURLToPath } from "node:url";

import { start } from "./server.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PORT = Number(process.env.TOOLS_HUB_PORT) || 4218;

async function main() {
  const stop = await start(PORT, __dirname);

  process.on("SIGINT", async () => {
    await stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start tools-hub:", err);
  process.exit(1);
});
