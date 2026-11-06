import { fileURLToPath } from "node:url";

import { resolveUp, distBrowserUiPaths } from "../../utils/index.mjs";

import assets from "./assets/index.mjs";
import distbrowser from "./distbrowser/index.mjs";
import logfinder from "./logfinder/index.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolveUp(__dirname, 3);

/**
 * Creates the static route registry.
 * Each route is { testUrl, serve }.
 *
 * @param {object} options
 * @param {string} [options.distBrowserUiDistDir] - override the dist-browser build output
 *   directory (defaults to repo-root/dist-browser/dist)
 */
export function createStaticRoutes({ distBrowserUiDistDir } = {}) {
  return [
    assets(),
    logfinder(REPO_ROOT),
    distbrowser(distBrowserUiDistDir ?? distBrowserUiPaths().distDir),
  ];
}

export default createStaticRoutes;
