import { createServer } from "node:http";

import createStaticRoutes from "./routes/static/index.mjs";
import apiRoutes from "./routes/api/index.mjs";

/**
 * Creates the tools-hub HTTP server.
 *
 * Static UI routes are mounted under /static/<name>/
 * API routes are mounted under /api/<module>.
 */
export function createServerInstance() {
  const staticRoutes = createStaticRoutes();
  const allRoutes = [...staticRoutes];

  return createServer((req, res) => {
    const { url } = req;

    // Static UI routes
    for (const route of allRoutes) {
      if (route.testUrl(url)) {
        route.serve(req, res);
        return;
      }
    }

    // API routes
    for (const route of apiRoutes) {
      if (route.testUrl(url)) {
        route.serve(req, res);
        return;
      }
    }

    // Fallback: 404
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });
}

export async function start(port) {
  const server = createServerInstance();

  await new Promise((resolve) => {
    server.listen(port, resolve);
    console.log(`tools-hub listening on port ${port}`);
  });

  return function stop() {
    return new Promise((resolve) => {
      server.close(() => {
        console.log("tools-hub stopped");
        resolve();
      });
    });
  };
}

export { createStaticRoutes } from "./routes/static/index.mjs";
export { apiRoutes };

export default createServerInstance;
