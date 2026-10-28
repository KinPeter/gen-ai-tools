import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function normalizePathSegment(segment) {
  // Decode URL-encoded characters, then normalize cross-platform:
  // replace backslashes with forward slashes
  try {
    return decodeURIComponent(segment).replace(/\\/g, "/");
  } catch {
    return segment.replace(/\\/g, "/");
  }
}

/**
 * Resolve a relative path segment into an absolute path under a base directory,
 * then verify it does not escape the base.
 * Returns { resolved, safe } where safe is false when path traversal is detected.
 */
function resolveBase(baseDir, relativePath) {
  const normalized = normalizePathSegment(relativePath);
  // Strip leading slashes to make the path relative to baseDir
  // (prevents treating /index.html as an absolute filesystem path)
  const relPath = normalized.replace(/^\/+/, "");
  const resolved = path.resolve(baseDir, relPath);
  // Ensure the resolved path starts with the base directory
  const base = path.resolve(baseDir);
  const safe = resolved === base || resolved.startsWith(base + path.sep);
  return { resolved, safe };
}

function getContentType(filePath) {
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

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function parseBody(req) {
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

function sendJSON(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

/**
 * GET /api/fs/:path  — Directory listing of ./dist/ relative paths
 */
function handleFS(baseDir, req, res) {
  // Determine if this is the root request (/api/fs or /api/fs/)
  const isRoot = /^\/api\/fs\/?$/.test(req.url || "/");

  // Compute relativePath once for all branches
  let relativePath;
  if (isRoot) {
    relativePath = "";
  } else {
    const urlPath = req.url.replace(/^\/api\/fs\/(.+)$/, "$1");
    if (!urlPath) {
      return sendError(res, 400, "Empty path");
    }
    relativePath = normalizePathSegment(urlPath);
  }

  // Single unified path resolution via resolveBase
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

  // Sort: folders first (alpha), then files (alpha)
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Strip trailing slash from path for consistency
  const displayPath = relativePath.replace(/\/+$/, "");
  sendJSON(res, 200, { path: displayPath, entries });
}

/**
 * GET /api/images/:path  — Stream image files from ./dist/
 */
function handleImages(baseDir, req, res) {
  const urlPath = req.url.replace(/^\/api\/images\/(.+)$/, "$1");
  const relativePath = normalizePathSegment(urlPath);

  if (!relativePath) {
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
  res.writeHead(200, {
    "Content-Type": contentType,
  });
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      sendError(res, 500, "Failed to read file");
    }
  });
}

/**
 * POST /api/trash  — Move files/folders to .trash/
 */
async function handleTrash(baseDir, req, res) {
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

  // Ensure .trash/ exists
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

    // Check if destination already exists
    const name = path.basename(resolved);
    let dest = path.join(trashDir, name);

    if (fs.existsSync(dest)) {
      // Append timestamp suffix
      const ext = path.extname(name);
      const baseName = ext
        ? name.replace(
            new RegExp(ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
            "",
          )
        : name;
      dest = path.join(trashDir, `${baseName}.${now}${ext}`);
    }

    // Re-verify destination stays under trashDir
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
 * GET /api/logs  — Return all log entries
 */
function handleLogs(logsDir, req, res) {
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
        // Skip unreadable/malformed files
        continue;
      }
    }
  } catch {
    return sendJSON(res, 200, { entries: [], fileCount: 0 });
  }

  sendJSON(res, 200, { entries: allEntries, fileCount });
}

/**
 * Serve static files from dist-browser/dist/
 */
function serveStatic(staticDir, req, res) {
  // Strip /api/ prefix for static files
  let filePath = req.url.replace(/^\/api\/.*/, "/index.html");
  if (filePath === "/" || filePath === "") {
    filePath = "/index.html";
  }

  const normalized = normalizePathSegment(filePath).replace(/^\/+/, "");
  const resolved = path.join(staticDir, normalized);
  const { safe } = resolveBase(staticDir, normalized);

  if (!safe) {
    return sendError(res, 403, "Forbidden");
  }

  if (!fs.existsSync(resolved)) {
    // SPA fallback: serve index.html
    const indexPath = path.join(staticDir, "index.html");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    } else {
      sendError(res, 404, "Not found");
    }
    return;
  }

  const contentType = getContentType(resolved);
  try {
    const content = fs.readFileSync(resolved);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    sendError(res, 500, "Failed to read file");
  }
}

/**
 * Create the HTTP request handler.
 * Returns an async function compatible with http.createServer.
 */
export function createHandler(baseDir, logsDir, staticDir) {
  // Match any /api/* route (for 405 rejection)
  const apiPathRegex = /^\/api\//;

  return async function handler(req, res) {
    try {
      const method = req.method || "GET";
      const url = req.url || "/";

      // API routes
      if (method === "GET" && url.startsWith("/api/fs")) {
        handleFS(baseDir, req, res);
        return;
      }

      if (method === "GET" && url.startsWith("/api/images")) {
        handleImages(baseDir, req, res);
        return;
      }

      if (method === "POST" && url === "/api/trash") {
        await handleTrash(baseDir, req, res);
        return;
      }

      if (method === "GET" && url === "/api/logs") {
        handleLogs(logsDir, req, res);
        return;
      }

      // Reject unsupported methods on API paths with 405
      if (apiPathRegex.test(url)) {
        return sendError(res, 405, "Method not allowed");
      }

      // Static file serving (SPA fallback)
      if (method === "GET") {
        serveStatic(staticDir, req, res);
        return;
      }

      sendError(res, 405, "Method not allowed");
    } catch (err) {
      console.error("Server error:", err);
      sendError(res, 500, "Internal server error");
    }
  };
}

/**
 * Start the HTTP server.
 */
export function createServer(config = {}) {
  const {
    baseDir,
    logsDir,
    staticDir: staticDirArg,
    port = Number(process.env.DIST_BROWSER_PORT) || 9324,
    host = "localhost",
  } = config;

  const projectRoot = process.cwd();
  const base = baseDir || path.join(projectRoot, "dist");
  const logs = logsDir || path.join(projectRoot, "output", "logs");
  const staticDir = staticDirArg || path.join(__dirname, "dist");

  const handler = createHandler(base, logs, staticDir);
  const server = http.createServer(handler);

  return {
    server,
    port,
    host,
    start: () =>
      new Promise((resolve, reject) => {
        server.listen(port, host, () => {
          console.log(`Server running on http://${host}:${port}`);
          resolve(server);
        });
        server.on("error", reject);
      }),
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

// Export handler for testing
export { handleFS, handleImages, handleTrash, handleLogs, serveStatic };

// If run directly, start the server
if (import.meta.main) {
  const { server } = createServer();
  server.listen(Number(process.env.DIST_BROWSER_PORT) || 9324, "localhost");
}
