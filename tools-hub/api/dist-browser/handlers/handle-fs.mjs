import fs from "node:fs";
import path from "node:path";
import {
  IMAGE_EXTENSIONS,
  normalizePathSegment,
  resolveBase,
  sendError,
  sendJSON,
} from "../../../utils/index.mjs";

/**
 * GET handler for /api/dist-browser/fs
 * Returns a directory listing of paths relative to baseDir.
 */
export function handleFS(baseDir, req, res) {
  const isRoot = /^\/api\/dist-browser\/fs\/?$/.test(req.url || "/");

  let relativePath;
  if (isRoot) {
    relativePath = "";
  } else {
    const urlPath = req.url.replace(/^\/api\/dist-browser\/fs\/(.+)$/, "$1");
    if (!urlPath) {
      return sendError(res, 400, "Empty path");
    }
    relativePath = normalizePathSegment(urlPath);
  }

  const { resolved, safe } = resolveBase(baseDir, relativePath);
  if (!safe) {
    return sendError(res, 403, "Path escapes allowed directory");
  }

  if (!fs.existsSync(resolved)) {
    return sendError(res, 404, "Directory not found");
  }

  const entries = [];
  try {
    const items = fs.readdirSync(resolved);
    for (const item of items) {
      const itemPath = path.join(resolved, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        entries.push({ name: item, type: "folder" });
      } else if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase().replace(".", "");
        if (IMAGE_EXTENSIONS.has(ext)) {
          entries.push({ name: item, type: "file", ext });
        }
      }
    }
  } catch {
    return sendError(res, 500, "Failed to read directory");
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const displayPath = relativePath.replace(/\/+$/, "");
  sendJSON(res, 200, { path: displayPath, entries });
}
