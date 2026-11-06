import fs from "node:fs";
import path from "node:path";
import { IMAGE_EXTENSIONS } from "../../../../dist-browser/src/utils/is-image.mjs";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

/**
 * Normalize a URL path segment: decode and convert backslashes.
 */
export function normalizePathSegment(segment) {
  try {
    return decodeURIComponent(segment).replace(/\\/g, "/");
  } catch {
    return segment.replace(/\\/g, "/");
  }
}

/**
 * Resolve a relative path under a base directory with path traversal protection.
 */
export function resolveBase(baseDir, relativePath) {
  const normalized = normalizePathSegment(relativePath);
  const relPath = normalized.replace(/^\/+/, "");
  const resolved = path.resolve(baseDir, relPath);
  const base = path.resolve(baseDir);
  const safe = resolved === base || resolved.startsWith(base + path.sep);
  return { resolved, safe };
}

/**
 * Get content type for a file extension.
 */
export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".html") return "text/html";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "application/javascript";
  if (ext === ".json") return "application/json";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

/**
 * Parse request body as JSON (async).
 */
export async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

/**
 * Send a JSON response.
 */
export function sendJSON(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Send an error JSON response.
 */
export function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

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

/**
 * POST handler for /api/dist-browser/trash
 * Moves files/folders to .trash/ under baseDir.
 */
export async function handleTrash(baseDir, req, res) {
  let body;
  try {
    const raw = await parseBody(req);
    body = JSON.parse(raw);
  } catch {
    return sendError(res, 400, "Invalid JSON body");
  }

  if (!body || !Array.isArray(body.paths) || body.paths.length === 0) {
    return sendError(res, 400, "Missing or malformed 'paths' array");
  }

  const trashDir = path.join(baseDir, ".trash");

  try {
    fs.mkdirSync(trashDir, { recursive: true });
  } catch {
    return sendError(res, 500, "Failed to create trash directory");
  }

  const errors = [];
  const now = new Date().toISOString().replace(/[:.]/g, "");

  for (const rel of body.paths) {
    const normalized = normalizePathSegment(rel);
    const { resolved, safe } = resolveBase(baseDir, normalized);

    if (!safe) {
      errors.push({ path: rel, error: "Path escapes allowed directory" });
      continue;
    }

    if (!fs.existsSync(resolved)) {
      errors.push({ path: rel, error: "Not found" });
      continue;
    }

    const name = path.basename(resolved);
    let dest = path.join(trashDir, name);

    if (fs.existsSync(dest)) {
      const ext = path.extname(name);
      const baseName = ext
        ? name.replace(
            new RegExp(ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
            "",
          )
        : name;
      dest = path.join(trashDir, `${baseName}.${now}${ext}`);
    }

    const { safe: destSafe } = resolveBase(trashDir, name);
    if (!destSafe) {
      errors.push({ path: rel, error: "Path escapes allowed directory" });
      continue;
    }

    try {
      fs.renameSync(resolved, dest);
    } catch (err) {
      errors.push({ path: rel, error: err.message || "Move failed" });
    }
  }

  sendJSON(res, 200, { ok: errors.length === 0, errors });
}

/**
 * GET handler for /api/dist-browser/logs
 * Returns all log entries from the logs directory.
 */
export function handleLogs(logsDir, req, res) {
  const allEntries = [];
  let fileCount = 0;

  if (!fs.existsSync(logsDir)) {
    return sendJSON(res, 200, { entries: [], fileCount: 0 });
  }

  try {
    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(logsDir, file);
      try {
        const data = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          allEntries.push(...parsed);
          fileCount++;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return sendJSON(res, 200, { entries: [], fileCount: 0 });
  }

  sendJSON(res, 200, { entries: allEntries, fileCount });
}
