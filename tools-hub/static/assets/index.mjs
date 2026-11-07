import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, resolve } from "node:path";

import { getContentType, resolveUp } from "../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolveUp(__filename, 4);

/**
 * Parse the URL path after `/assets/` and resolve to a file path.
 */
function resolveAssetPath(url) {
  const assetsRoot = resolve(REPO_ROOT, "tools-hub/assets");

  if (url === "/assets" || url === "/assets/") {
    // Match /assets and /assets/ — no specific file, fall through to 404
    return null;
  }

  // Strip leading /assets/ prefix
  const relative = url.replace(/^\/assets\//, "");
  if (!relative) {
    return null;
  }

  return resolve(assetsRoot, relative);
}

/**
 * Test whether a URL should be handled by the assets route.
 * Matches /assets, /assets/, /assets/anything.
 */
function testUrl(url) {
  return url === "/assets" || url === "/assets/" || url.startsWith("/assets/");
}

/**
 * Serve the requested asset file.
 */
function serve(req, res) {
  const filePath = resolveAssetPath(req.url);

  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  try {
    const data = readFileSync(filePath);
    const mime = getContentType(basename(filePath));

    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch (err) {
    const isNotFound = err.code === "ENOENT";
    res.writeHead(isNotFound ? 404 : 500, {
      "Content-Type": "text/plain",
    });
    res.end(isNotFound ? "Not Found" : "Internal Server Error");
  }
}

/**
 * Factory function returning an assets route object.
 */
export default function assets() {
  return { testUrl, serve };
}
