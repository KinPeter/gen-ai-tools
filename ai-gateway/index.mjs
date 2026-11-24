import "dotenv/config";

import { start } from "./server.mjs";
import { primaryLanAddress } from "./utils/network.mjs";

const PORT = Number(process.env.AIGW_PORT) || 4218;

async function main() {
  const lanAddress = primaryLanAddress();
  const stop = await start({ port: PORT, lanAddress });

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
  console.error("Failed to start ai-gateway:", err);
  process.exit(1);
});
