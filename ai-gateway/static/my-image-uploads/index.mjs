import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const UI_PATH = resolve(dirname(__filename), "index.html");

/**
 * Serves the My Image Uploads UI at /my-image-uploads.
 * The page is a single self-contained HTML file; any path below the mount
 * (including trailing slashes) serves it, query string ignored.
 * Reads the file from disk per request — no caching — so edits show up
 * on a plain refresh.
 */
function normalizePath(url) {
  return (url || "").split("?")[0].replace(/\/+$/, "");
}

function testUrl(url) {
  const path = normalizePath(url);
  return path === "/my-image-uploads" || path.startsWith("/my-image-uploads/");
}

function serve(req, res) {
  try {
    const html = readFileSync(UI_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    console.error("Failed to serve my-image-uploads UI:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

export default function myImageUploads() {
  return { testUrl, serve };
}
