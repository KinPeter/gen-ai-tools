import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { getContentType, resolveBase } from "../../utils/file.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ASSETS_ROOT = resolve(__dirname, "../../assets");
const NOT_FOUND_CODES = new Set(["ENOENT", "EISDIR", "ENOTDIR"]);

/**
 * Match /assets, /assets/ and every sub-path below it, ignoring the query string.
 */
function testUrl(url) {
  const path = (url || "").split("?")[0];
  return (
    path === "/assets" || path === "/assets/" || path.startsWith("/assets/")
  );
}

function relativeAssetPath(url) {
  const withoutQuery = (url || "").split("?")[0];
  return withoutQuery.slice("/assets/".length);
}

function textResponse(status, message) {
  return { status, body: message, contentType: "text/plain; charset=utf-8" };
}

function serve(req, res) {
  const withoutQuery = (req.url || "").split("?")[0];
  const bare = withoutQuery === "/assets" || withoutQuery === "/assets/";

  if (bare) {
    const { status, body, contentType } = textResponse(404, "Not Found");
    res.writeHead(status, { "Content-Type": contentType });
    res.end(body);
    return;
  }

  const relative = relativeAssetPath(req.url);
  const { resolved, safe } = resolveBase(ASSETS_ROOT, relative);

  if (!safe) {
    const { status, body, contentType } = textResponse(403, "Forbidden");
    res.writeHead(status, { "Content-Type": contentType });
    res.end(body);
    return;
  }

  try {
    const data = readFileSync(resolved);
    res.writeHead(200, { "Content-Type": getContentType(resolved) });
    res.end(data);
  } catch (err) {
    if (NOT_FOUND_CODES.has(err.code)) {
      const { status, body, contentType } = textResponse(404, "Not Found");
      res.writeHead(status, { "Content-Type": contentType });
      res.end(body);
      return;
    }
    const { status, body, contentType } = textResponse(
      500,
      "Internal Server Error",
    );
    res.writeHead(status, { "Content-Type": contentType });
    res.end(body);
  }
}

export default function assets() {
  return { testUrl, serve };
}
