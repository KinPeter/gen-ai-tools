import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const UI_PATH = resolve(dirname(__filename), "index.html");

/**
 * Serves the Cheyoon Image Uploads UI at /cy-image-uploads.
 * The page is a single HTML file; any path below the mount (including trailing
 * slashes) serves it, query string ignored. Reads the file from disk per
 * request — no caching — so edits show up on a plain refresh.
 *
 * Duplicates static/my-image-uploads/index.mjs deliberately: the two mounts
 * have their own HTML page, so the only shared code would be three path
 * strings. Styles and logic are shared through /assets/image-uploads.css and
 * /assets/image-uploads.js instead.
 */
function normalizePath(url) {
  return (url || "").split("?")[0].replace(/\/+$/, "");
}

function testUrl(url) {
  const path = normalizePath(url);
  return path === "/cy-image-uploads" || path.startsWith("/cy-image-uploads/");
}

function serve(req, res) {
  try {
    const html = readFileSync(UI_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    console.error("Failed to serve cy-image-uploads UI:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

export default function cyImageUploads() {
  return { testUrl, serve };
}
