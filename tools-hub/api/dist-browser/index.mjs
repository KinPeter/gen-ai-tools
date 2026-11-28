import { handleFS, handleImages, handleTrash } from "./handlers/index.mjs";
import { resolveDistPath } from "../../../comfyui/utils/paths.mjs";

/**
 * Factory function that creates the three dist-browser API route objects.
 *
 * @param {object} config - Route configuration
 * @param {string} config.baseDir - Base directory for fs/images/trash (default: COMFY_DIST_PATH or repo-root/dist)
 * @returns {Array<{testUrl: Function, serve: Function}>}
 */
export default function apiDistBrowser(config = {}) {
  const baseDir = config.baseDir || resolveDistPath(process.env);

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

  return [
    { testUrl: testFS, serve: serveFS },
    { testUrl: testImages, serve: serveImages },
    { testUrl: testTrash, serve: serveTrash },
  ];
}
