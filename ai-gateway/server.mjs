import { createServer } from "node:http";

import createStaticRoutes from "./static/index.mjs";
import apiRoutes from "./api/index.mjs";

/**
 * Creates the ai-gateway HTTP server.
 *
 * Static UI routes are mounted at clean paths (/), the API routes are mounted
 * under /api/<module> (none yet). First match in each list wins, then 404.
 *
 * @param {object} [options] - passed to createStaticRoutes, e.g. { status: { port, lanAddress } }
 */
export function createServerInstance(options = {}) {
  const staticRoutes = createStaticRoutes(options);

  return createServer((req, res) => {
    const { url } = req;

    for (const route of staticRoutes) {
      if (route.testUrl(url)) {
        route.serve(req, res);
        return;
      }
    }

    for (const route of apiRoutes) {
      if (route.testUrl(url)) {
        route.serve(req, res);
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });
}

function listen(server, port) {
  // Bind to all IPv4 interfaces: other computers on the LAN must reach the
  // gateway (it runs on the home AI server, not the local machine).
  return new Promise((resolve) => {
    server.listen(port, "0.0.0.0", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log("\nai-gateway stopped");
      resolve();
    });
  });
}

export async function start({ port = 4218, lanAddress = null } = {}) {
  const server = createServerInstance({ status: { port, lanAddress } });
  await listen(server, port);

  const url = lanAddress
    ? `http://${lanAddress}:${port}`
    : `http://0.0.0.0:${port}`;
  const prefix = lanAddress ? "" : "no LAN address detected — ";
  console.log(`ai-gateway listening on port ${port} — ${prefix}${url}`);

  return async function stop() {
    await closeServer(server);
  };
}

export { createStaticRoutes } from "./static/index.mjs";
export { apiRoutes };

export default createServerInstance;
