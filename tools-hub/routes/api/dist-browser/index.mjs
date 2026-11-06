import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  handleFS,
  handleImages,
  handleTrash,
  handleLogs,
} from "./handlers.mjs";

/**
 * Resolve the repository root by walking up from this file to the tools-hub
 * directory, then one more level up to the repo root.
 * tools-hub runs from repo root when invoked as `node tools-hub/index.mjs`.
 * Returns the repo root (sibling of the tools-hub directory).
 */
function resolveRepoRoot() {
  const current = fileURLToPath(new URL(".", import.meta.url));
  const segments = current.split(path.sep);
  // Walk up until we find the tools-hub directory
  let dir = segments.join(path.sep);
  while (!dir.endsWith(path.sep + "tools-hub") && dir !== "/") {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // One level up from tools-hub/ → repo root
  return path.dirname(dir);
}

/**
 * Factory function that creates the four dist-browser API route objects.
 *
 * @param {object} config - Route configuration
 * @param {string} config.baseDir - Base directory for fs/images/trash (default: repo-root/dist)
 * @param {string} config.logsDir - Directory for log entries (default: repo-root/output/logs)
 * @returns {Array<{testUrl: Function, serve: Function}>}
 */
export default function apiDistBrowser(config = {}) {
  const repoRoot = resolveRepoRoot();
  const baseDir = config.baseDir || path.join(repoRoot, "dist");
  const logsDir = config.logsDir || path.join(repoRoot, "output", "logs");

  // --- Route: GET /api/dist-browser/fs/:path ---
  function testFS(url) {
    return url.startsWith("/api/dist-browser/fs");
  }

  function serveFS(req, res) {
    handleFS(baseDir, { ...req, url: req.url }, res);
  }

  // --- Route: GET /api/dist-browser/images/:path ---
  function testImages(url) {
    return (
      url === "/api/dist-browser/images" ||
      url.startsWith("/api/dist-browser/images/")
    );
  }

  function serveImages(req, res) {
    handleImages(baseDir, { ...req, url: req.url }, res);
  }

  // --- Route: POST /api/dist-browser/trash ---
  function testTrash(url) {
    return (
      url === "/api/dist-browser/trash" ||
      url.startsWith("/api/dist-browser/trash/")
    );
  }

  async function serveTrash(req, res) {
    await handleTrash(baseDir, req, res);
  }

  // --- Route: GET /api/dist-browser/logs ---
  function testLogs(url) {
    return (
      url === "/api/dist-browser/logs" ||
      url.startsWith("/api/dist-browser/logs/")
    );
  }

  function serveLogs(req, res) {
    handleLogs(logsDir, req, res);
  }

  return [
    { testUrl: testFS, serve: serveFS },
    { testUrl: testImages, serve: serveImages },
    { testUrl: testTrash, serve: serveTrash },
    { testUrl: testLogs, serve: serveLogs },
  ];
}
