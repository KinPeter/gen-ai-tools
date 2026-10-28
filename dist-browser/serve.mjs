import { build } from "vite";
import { createServer } from "node:http";
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

  // Start HTTP server serving the built files
  const port = Number(process.env.DIST_BROWSER_PORT) || 9324;

  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Dist Browser</h1><p>Server running</p>");
  });

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
