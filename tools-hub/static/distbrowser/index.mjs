import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIST_BROWSER_UI_INDEX_FILE,
  DIST_BROWSER_UI_ROUTE_PATH,
  getContentType,
  resolveBase,
  SKIP_UI_BUILD_ENV_VAR,
  distBrowserUiPaths,
} from "../../utils/index.mjs";

const DEFAULT_DIST_DIR = distBrowserUiPaths().distDir;
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const NOT_FOUND_CODES = new Set(["ENOENT", "EISDIR", "ENOTDIR"]);

/**
 * Match `/distbrowser`, `/distbrowser/` and every sub-path below it,
 * ignoring any query string.
 */
function testUrl(url) {
  const path = (url || "").split("?")[0];

  return (
    path === DIST_BROWSER_UI_ROUTE_PATH ||
    path.startsWith(`${DIST_BROWSER_UI_ROUTE_PATH}/`)
  );
}

/**
 * Path below `/distbrowser`, without query string or leading slashes.
 */
function relativeAssetPath(url) {
  const withoutQuery = (url || "").split("?")[0];

  return withoutQuery
    .slice(DIST_BROWSER_UI_ROUTE_PATH.length)
    .replace(/^\/+/, "");
}

function textResponse(status, message) {
  return { status, body: message, contentType: "text/plain" };
}

/**
 * Read one artifact from the build output, rejecting paths that escape it.
 */
function readArtifact(distDir, relativePath) {
  const { resolved, safe } = resolveBase(distDir, relativePath);

  if (!safe) {
    return textResponse(403, "Forbidden");
  }

  try {
    return {
      status: 200,
      body: readFileSync(resolved),
      contentType: getContentType(resolved),
    };
  } catch (err) {
    if (NOT_FOUND_CODES.has(err.code)) {
      return textResponse(404, "Not Found");
    }

    return textResponse(500, "Internal Server Error");
  }
}

/**
 * Response for a request whose file does not exist: the SPA entry file if
 * the UI has been built, otherwise a hint on how to build it.
 */
function notFoundResponse(distDir) {
  if (existsSync(join(distDir, DIST_BROWSER_UI_INDEX_FILE))) {
    return readArtifact(distDir, DIST_BROWSER_UI_INDEX_FILE);
  }

  return textResponse(
    404,
    `dist-browser UI is not built (no ${DIST_BROWSER_UI_INDEX_FILE} in ${distDir}). Run "npm run dist-browser:build", or start tools-hub without ${SKIP_UI_BUILD_ENV_VAR}.`,
  );
}

/**
 * Resolve a request to a file. Only genuine "not found" requests fall back
 * to index.html so the SPA can handle its own routes; traversal (403) and
 * read failures (500) are returned as-is.
 */
function resolveArtifact(distDir, url) {
  const requested = readArtifact(distDir, relativeAssetPath(url));

  if (requested.status !== 404) {
    return requested;
  }

  return notFoundResponse(distDir);
}

/**
 * Pure request-to-response mapping, so the route can be tested without a
 * real ServerResponse.
 */
function responseFor(req, distDir) {
  const method = req.method || "GET";

  if (!ALLOWED_METHODS.has(method)) {
    return textResponse(405, "Method Not Allowed");
  }

  return resolveArtifact(distDir, req.url || "");
}

/**
 * Factory function returning the dist-browser UI route.
 *
 * @param {string} distDir - Vite build output directory
 *   (default: repo-root/dist-browser/dist)
 */
export default function distbrowser(distDir = DEFAULT_DIST_DIR) {
  function serve(req, res) {
    const { status, body, contentType } = responseFor(req, distDir);

    res.writeHead(status, { "Content-Type": contentType });
    res.end(body);
  }

  return { testUrl, serve };
}
