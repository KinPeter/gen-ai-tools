import "dotenv/config";

import { start } from "./server.mjs";
import { buildDistBrowserUi } from "./static/distbrowser/ui-build.mjs";

const PORT = Number(process.env.TOOLS_HUB_PORT) || 4218;

async function main() {
  // Build the dist-browser React app before listening. buildDistBrowserUi() never
  // throws: a failed build only logs, so existing artifacts still serve.
  await buildDistBrowserUi();

  const stop = await start(PORT);

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
