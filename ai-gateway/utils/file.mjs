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
 * Single MIME type map for every static file served by ai-gateway. Text types
 * carry a charset so browsers render them instead of downloading them.
 */
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const DEFAULT_MIME_TYPE = "application/octet-stream";

/**
 * Get content type for a file extension.
 */
export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || DEFAULT_MIME_TYPE;
}

/**
 * Validate a plain basename: after trimming it must be non-empty, must not
 * contain `/` or `\`, and must not be exactly `.` or `..`. This is the rule the
 * delete endpoint uses — an invalid name is skipped, never resolved.
 */
export function isPlainBasename(name) {
  if (typeof name !== "string") return false;
  if (!name.trim()) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.trim() === "." || name.trim() === "..") return false;
  return true;
}

/**
 * Normalize an uploaded filename to the plain basename kept on disk: any path
 * components (both separators) are stripped, then the name must be non-empty
 * after trimming and must not be `.` or `..`. Returns `null` when nothing usable
 * remains — callers treat it as an invalid name.
 */
export function stripBasename(name) {
  if (typeof name !== "string") return null;
  const base = name.trim().replace(/\\/g, "/").split("/").pop() || "";
  const trimmed = base.trim();
  if (!trimmed) return null;
  if (trimmed === "." || trimmed === "..") return null;
  return trimmed;
}
