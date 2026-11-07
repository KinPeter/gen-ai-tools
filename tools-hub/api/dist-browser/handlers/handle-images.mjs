import fs from "node:fs";
import path from "node:path";
import {
  IMAGE_EXTENSIONS,
  getContentType,
  normalizePathSegment,
  resolveBase,
  sendError,
} from "../../../utils/index.mjs";

/**
 * GET handler for /api/dist-browser/images
 * Streams image files from baseDir.
 */
export function handleImages(baseDir, req, res) {
  const urlPath = req.url.replace(
    /^\/api\/dist-browser\/images(\/?(.+))?$/,
    "$2",
  );
  const relativePath = normalizePathSegment(urlPath);

  if (!relativePath || relativePath === "/") {
    return sendError(res, 400, "Empty path");
  }

  const { resolved, safe } = resolveBase(baseDir, relativePath);
  if (!safe) {
    return sendError(res, 403, "Path escapes allowed directory");
  }

  if (!fs.existsSync(resolved)) {
    return sendError(res, 404, "File not found");
  }

  const ext = path.extname(resolved).toLowerCase().replace(/^\./, "");
  if (!IMAGE_EXTENSIONS.has(ext)) {
    return sendError(res, 404, "Not an image file");
  }

  const contentType = getContentType(resolved);

  // Read before committing a status: once headers are sent, a 500 is no
  // longer possible, so a read failure would be silently swallowed.
  let data;
  try {
    data = fs.readFileSync(resolved);
  } catch {
    return sendError(res, 500, "Failed to read file");
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": data.length,
  });
  res.end(data);
}
