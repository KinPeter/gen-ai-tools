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
