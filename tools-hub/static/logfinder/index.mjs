import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { resolveUp } from "../../utils/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolveUp(__filename, 4);
const UI_PATH = resolve(REPO_ROOT, "logging/logfinder-ui/index.html");
const MIME_TYPE = "text/html; charset=utf-8";

/**
 * Serves the Log Finder UI.
 * Mounts at /logfinder and /logfinder/
 * (later: /logfinder/* for deeper paths)
 */

function testUrl(url) {
  return url === "/logfinder" || url.startsWith("/logfinder/");
}

function serve(req, res) {
  try {
    const html = readFileSync(UI_PATH, "utf-8");

    res.writeHead(200, { "Content-Type": MIME_TYPE });
    res.end(html);
  } catch (err) {
    console.error("Failed to serve logfinder UI:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

export default function logfinder() {
  return { testUrl, serve };
}
