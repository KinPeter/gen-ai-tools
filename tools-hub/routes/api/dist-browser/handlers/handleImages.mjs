import fs from "node:fs";
import path from "node:path";
import { IMAGE_EXTENSIONS } from "../../../../utils/constants.mjs";
import {
  normalizePathSegment,
  resolveBase,
  getContentType,
} from "../../../../utils/file.mjs";
import { sendError } from "../../../../utils/http.mjs";

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
  const stream = fs.createReadStream(resolved);
  res.writeHead(200, { "Content-Type": contentType });
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      sendError(res, 500, "Failed to read file");
    }
  });
}
