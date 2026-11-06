import {
  handleFS,
  handleImages,
  handleTrash,
  handleLogs,
} from "./handlers/index.mjs";
import { resolveRepoRoot } from "../../../utils/index.mjs";

/** Output directory of generated images, relative to the repo root. */
const DEFAULT_BASE_DIR = "dist";
/** Directory holding run logs, relative to the repo root. */
const DEFAULT_LOGS_DIR = "output/logs";

/**
 * Factory function that creates the four dist-browser API route objects.
 *
 * @param {object} config - Route configuration
 * @param {string} config.baseDir - Base directory for fs/images/trash (default: repo-root/dist)
 * @param {string} config.logsDir - Directory for log entries (default: repo-root/output/logs)
 * @returns {Array<{testUrl: Function, serve: Function}>}
 */
export default function apiDistBrowser(config = {}) {
  const baseDir = config.baseDir || resolveRepoRoot(DEFAULT_BASE_DIR);
  const logsDir = config.logsDir || resolveRepoRoot(DEFAULT_LOGS_DIR);

  // --- Route: GET /api/dist-browser/fs/:path ---
  function testFS(url) {
    return url.startsWith("/api/dist-browser/fs");
  }

  function serveFS(req, res) {
    handleFS(baseDir, req, res);
  }

  // --- Route: GET /api/dist-browser/images/:path ---
  function testImages(url) {
    return (
      url === "/api/dist-browser/images" ||
      url.startsWith("/api/dist-browser/images/")
    );
  }

  function serveImages(req, res) {
    handleImages(baseDir, req, res);
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
