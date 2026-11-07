import fs from "node:fs";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

/**
 * Verifies that the `dist/` directory exists.
 * @returns {boolean} true
 * @throws {Error} if `dist/` does not exist
 */
export function checkDistExists() {
  fs.accessSync("dist", fs.constants.F_OK);
}

/**
 * Glob all `*.json` files under `logsDir` recursively, attempt to parse
 * each as a JSON array. Returns a `{ readable, unreadable, entries }` object.
 *
 * @param {string} logsDir
 * @param {{ accessSync?: typeof fs.accessSync; readdir?: typeof fs.promises.readdir; readFile?: typeof readFile }} [deps]
 * @returns {Promise<{ readable: string[], unreadable: string[], entries: any[] }>}
 */
export async function scanLogFiles(
  logsDir,
  {
    accessSync = fs.accessSync,
    readdir = fs.promises.readdir,
    readFile: _readFile = readFile,
  } = {},
) {
  const allJsonFiles = [];
  await collectJsonFiles(logsDir, allJsonFiles, { accessSync, readdir });

  const readable = [];
  const unreadable = [];
  const entries = [];

  for (const filePath of allJsonFiles) {
    try {
      const content = await _readFile(filePath, "utf-8");
      const fileEntries = JSON.parse(content);
      if (Array.isArray(fileEntries)) {
        readable.push(filePath);
        for (const entry of fileEntries) {
          entries.push(entry);
        }
      } else {
        console.warn(`Warning: ${filePath} — not a JSON array, skipping`);
        unreadable.push(filePath);
      }
    } catch {
      console.warn(`Warning: ${filePath} — could not read, skipping`);
      unreadable.push(filePath);
    }
  }

  readable.sort();
  unreadable.sort();

  return { readable, unreadable, entries };
}

/**
 * Recursively collect all *.json file paths under a directory.
 * @param {string} dir
 * @param {string[]} out
 * @param {{ accessSync: typeof fs.accessSync; readdir: typeof fs.promises.readdir }} deps
 */
async function collectJsonFiles(dir, out, { accessSync, readdir }) {
  try {
    accessSync(dir, fs.constants.R_OK);
  } catch {
    return;
  }

  const items = await readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      await collectJsonFiles(fullPath, out, { accessSync, readdir });
    } else if (item.isFile() && item.name.endsWith(".json")) {
      out.push(fullPath);
    }
  }
}

/**
 * For each entry, check if its image exists in dist/ by converting the
 * filename extension from .png (or whatever) to .jpg and searching
 * recursively.
 *
 * @param {any[]} entries
 * @param {string} distRoot
 * @returns {{ kept: any[], removed: number }}
 */
export function checkEntries(entries, distRoot) {
  const kept = [];
  let removed = 0;

  for (const entry of entries) {
    const filename = entry?.filename;
    if (!filename || typeof filename !== "string" || filename.trim() === "") {
      removed += 1;
      continue;
    }

    const jpgName = filename.replace(/\.png$/, ".jpg");
    if (findFileInDist(jpgName, distRoot)) {
      kept.push(entry);
    } else {
      removed += 1;
    }
  }

  return { kept, removed };
}

/**
 * Recursively search distRoot for a filename.
 * @param {string} targetName
 * @param {string} dir
 * @returns {boolean}
 */
function findFileInDist(targetName, dir) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isFile() && item.name === targetName) {
        return true;
      }
      if (item.isDirectory()) {
        if (findFileInDist(targetName, path.join(dir, item.name))) {
          return true;
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read — stop searching
  }
  return false;
}

/**
 * Write a consolidated JSON file at `filePath` containing `entries`.
 * @param {string} filePath
 * @param {any[]} entries
 */
export function writeConsolidatedFile(filePath, entries) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + "\n");
}

/**
 * Delete all *.json files in logsDir except the consolidated file and
 * unreadable files. Returns the count of files deleted.
 *
 * @param {string} logsDir
 * @param {string} keepFilePath
 * @param {string[]} unreadableFiles
 * @param {{ readdir?: typeof fs.promises.readdir; rm?: typeof rm }} [deps]
 * @returns {Promise<number>} count of deleted files
 */
export async function deleteOldFiles(
  logsDir,
  keepFilePath,
  unreadableFiles,
  { readdir = fs.promises.readdir, rm: _rm = rm } = {},
) {
  let deleted = 0;

  const deleteFromDir = async (dir) => {
    try {
      const items = await readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          deleted += await deleteFromDir(fullPath);
        } else if (item.isFile() && item.name.endsWith(".json")) {
          if (fullPath === keepFilePath || unreadableFiles.includes(fullPath)) {
            continue;
          }
          await _rm(fullPath);
          deleted += 1;
          console.log(`Deleted: ${path.relative(logsDir, fullPath)}`);
        }
      }
    } catch {
      // Skip unreadable directories
    }
    return deleted;
  };

  return deleteFromDir(logsDir);
}

/**
 * Print a confirmation summary and read Y/n from stdin.
 * Returns true if the user confirmed (Y / empty), false otherwise.
 *
 * @param {{ scanned: number; entries: number; kept: number; removed: number; unreadable: number }} stats
 * @param {string} newFilePath
 * @param {{ createInterface?: typeof import("node:readline/promises").createInterface }} [deps]
 * @returns {Promise<boolean>}
 */
export async function showConfirmation(
  stats,
  newFilePath,
  { createInterface: _createInterface = createInterface, force = false } = {},
) {
  if (!force && process.stdin.isTTY !== true) {
    throw new Error(
      "Log cleanup requires interactive confirmation. " +
        "Run directly with: node logging/log-cleanup.mjs",
    );
  }

  const rl = _createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n=== Log Cleanup ===");
  console.log(`Scanned: ${stats.scanned} log files`);
  console.log(`Entries found: ${stats.entries}`);
  console.log(`  → kept (image still in dist/): ${stats.kept}`);
  console.log(`  → removed (image missing): ${stats.removed}`);
  console.log(`Unreadable files (skipped, not deleted): ${stats.unreadable}`);
  console.log(`\nNew file: ${newFilePath}`);
  console.log("Delete old log files? [Y/n]");

  const answer = await rl.question("");
  rl.close();

  const normalized = String(answer).trim().toLowerCase();
  return normalized === "n";
}

/**
 * Orchestrator: check dist, scan log files, filter by dist existence,
 * confirm, write consolidated file, delete old files.
 */
export async function main(options = {}) {
  checkDistExists();

  const logsDir = "output/logs/";
  const { readable, unreadable, entries } = await scanLogFiles(logsDir);

  const { kept, removed } = checkEntries(entries, "dist");

  const stats = {
    scanned: readable.length + unreadable.length,
    entries: entries.length,
    kept: kept.length,
    removed,
    unreadable: unreadable.length,
  };

  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:Z]/g, "")
    .slice(0, 14);
  const newFilePath = `output/logs/logs_${timestamp}.json`;

  const shouldAbort = await showConfirmation(stats, newFilePath, {
    force: options?.force,
  });
  if (shouldAbort) {
    console.log("Aborted.");
    return;
  }

  writeConsolidatedFile(newFilePath, kept);
  console.log(`Written: ${newFilePath}`);

  const deleted = await deleteOldFiles(logsDir, newFilePath, unreadable);
  console.log(`Done. ${deleted} old log files deleted.`);
}

// Execute only when the script is run directly (e.g., `node log-cleanup.mjs`)
// and ONLY when stdin is a TTY (interactive). This prevents accidental
// execution during automated test runs or CI where main() could read empty
// stdin, default to "proceed", and destroy data.
const isDirectExec = import.meta.url === `file://${process.argv[1]}`;
const isTTY = process.stdin.isTTY === true;

if (isDirectExec && isTTY) {
  main();
} else if (isDirectExec && !isTTY) {
  console.error(
    "Error: Log cleanup requires interactive confirmation. Run directly with:",
  );
  console.error("  node logging/log-cleanup.mjs");
  console.error("");
  console.error(
    "This script is dangerous without a TTY — it will proceed without confirmation.",
  );
  process.exit(1);
}
