import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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
  const repoRoot = resolveUp(__filename, 2);
  return resolve(repoRoot, relPath);
}
