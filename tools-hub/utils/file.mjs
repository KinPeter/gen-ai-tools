import path from "node:path";

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
