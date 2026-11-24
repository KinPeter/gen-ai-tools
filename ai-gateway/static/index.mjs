import assets from "./assets/index.mjs";
import status from "./status/index.mjs";

/**
 * Creates the static route registry.
 * Each route is { testUrl, serve }.
 *
 * @param {object} [options]
 * @param {object} [options.status] - status page options: { port, lanAddress }
 *   (default: { port: 4218, lanAddress: null })
 */
export function createStaticRoutes({ status: statusOptions } = {}) {
  return [assets(), status(statusOptions)];
}

export default createStaticRoutes;
