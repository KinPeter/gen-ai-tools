import { fileURLToPath } from "node:url";

import { resolveUp } from "../../utils/path.mjs";

import logfinder from "./logfinder/index.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolveUp(__dirname, 3);

/**
 * Creates the static route registry.
 * Each route is { testUrl, serve }.
 */
export function createStaticRoutes() {
  return [logfinder(REPO_ROOT)];
}

export default createStaticRoutes;
