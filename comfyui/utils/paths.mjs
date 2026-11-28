import path from "node:path";
import { readdir, stat } from "node:fs/promises";

// Errors that simply mean "nothing to look at here" while walking asset trees.
const ABSENT_CODES = new Set(["ENOENT", "ENOTDIR", "ELOOP"]);
// Folders a shared asset tree can carry that never hold asset files.
const SKIPPED_DIRS = new Set(["node_modules", ".git"]);

export function isInsideDir(base, target) {
  const rel = path.relative(base, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`));
}

/** Returns true when filePath resolves to a regular file; symlinked files count, absent paths, folders and broken links do not. */
export async function isFileHere(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (err) {
    if (ABSENT_CODES.has(err.code)) return false;
    throw err;
  }
}

// Breadth-first search of everything below base for a regular file named
// fileName. Symlinked folders are skipped, so the walk cannot cycle; symlinked
// files are matched because stat() follows them.
export async function collectMatches(base, fileName) {
  const matches = [];
  const queue = [base];
  for (let i = 0; i < queue.length; i++) {
    const dir = queue[i];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (ABSENT_CODES.has(err.code)) continue;
      throw err;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) queue.push(entryPath);
      } else if (entry.name === fileName && (await isFileHere(entryPath))) {
        matches.push(entryPath);
      }
    }
  }
  return matches;
}

export function resolveDestDir(baseDir, outputFolder) {
  const base = path.normalize(baseDir);
  if (outputFolder == null || String(outputFolder).trim() === "") {
    return base;
  }
  const resolved = path.normalize(path.join(base, String(outputFolder).trim()));
  if (isInsideDir(base, resolved)) {
    return resolved;
  }
  console.warn(
    `Ignoring unsafe output-folder: ${JSON.stringify(outputFolder)}`,
  );
  return base;
}

// Repo-root dist/ is the fallback when COMFY_DIST_PATH is unset, so the
// example files and the tooling in this repo keep working in a clean checkout.
// This file owns that base; every consumer resolves the dist folder through
// resolveDistPath().
export const REPO_DIST_DIR = path.join(import.meta.dirname, "..", "..", "dist");

/**
 * Resolve the dist output base from the environment. COMFY_DIST_PATH is taken
 * literally and must be absolute, so the output never depends on the current
 * directory; unset or blank falls back to repo-root dist/.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string} the dist base directory
 * @throws when a value that is set is not an absolute path.
 */
export function resolveDistPath(env = process.env) {
  const raw = env.COMFY_DIST_PATH;
  const value = raw == null ? "" : String(raw).trim();
  if (value === "") return REPO_DIST_DIR;
  if (!path.isAbsolute(value)) {
    throw new Error(
      `COMFY_DIST_PATH must be an absolute path: ${JSON.stringify(value)}`,
    );
  }
  const normalized = path.normalize(value);
  // Keep the result a bare directory path: strip a trailing separator so it
  // compares cleanly with the repo-root default (root itself keeps its slash).
  return normalized === path.sep
    ? normalized
    : normalized.replace(/[/\\]+$/, "");
}
