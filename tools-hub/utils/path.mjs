import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  DIST_BROWSER_UI_DIST_DIR,
  DIST_BROWSER_UI_SOURCE_DIR,
} from "./constants.mjs";

/**
 * Walk up `levels` directories from a file or directory path.
 */
export function resolveUp(file, levels) {
  let current = file;
  for (let i = 0; i < levels; i++) {
    current = dirname(current);
  }
  return current;
}

/**
 * Resolve a path relative to the repository root.
 *
 * @param {string} relPath - Relative path from repo root (e.g. "logging/logfinder-ui/index.html")
 * @returns {string} Absolute path to repo root + relPath
 */
export function resolveRepoRoot(relPath) {
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = resolveUp(__filename, 3);
  return resolve(repoRoot, relPath);
}

/**
 * Absolute paths of the dist-browser React app and its Vite build output.
 * Single source of truth for the UI source and dist directories.
 */
export function distBrowserUiPaths() {
  return {
    root: resolveRepoRoot(DIST_BROWSER_UI_SOURCE_DIR),
    distDir: resolveRepoRoot(DIST_BROWSER_UI_DIST_DIR),
  };
}
