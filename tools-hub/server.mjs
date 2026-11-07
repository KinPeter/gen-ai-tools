import { createServer } from "node:http";

import createStaticRoutes from "./static/index.mjs";
import apiRoutes from "./api/index.mjs";
import { closeDb, openDb } from "./utils/index.mjs";

/**
 * Creates the tools-hub HTTP server.
 *
 * Static UI routes are mounted under /<name>/
 * API routes are mounted under /api/<module>.
 *
 * @param {object} [options] - passed to createStaticRoutes, e.g. distBrowserUiDistDir
 */
export function createServerInstance(options = {}) {
  const staticRoutes = createStaticRoutes(options);
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

/**
 * Opens the shared MongoDB connection. A failure is logged rather than
 * thrown, so the server still serves every route that does not need the
 * database; database-backed routes answer 503 instead.
 */
async function connectDatabase() {
  try {
    await openDb();
  } catch (err) {
    console.warn(
      `tools-hub: MongoDB unavailable (${err.message}) — ` +
        "database-backed API routes will return 503",
    );
  }
}

function listen(server, port) {
  return new Promise((resolve) => {
    server.listen(port, resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log("\ntools-hub stopped");
      resolve();
    });
  });
}

export async function start(port) {
  await connectDatabase();

  const server = createServerInstance();
  await listen(server, port);
  console.log(`tools-hub listening on port ${port}`);

  return async function stop() {
    await closeServer(server);
    await closeDb();
  };
}

export { createStaticRoutes } from "./static/index.mjs";
export { apiRoutes };

export default createServerInstance;
