import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { getImageLogConnection } from "./client.mjs";

const DIST_DIR = "dist/";

/**
 * Strip the file extension from a filename (everything after the last dot).
 * Returns the original string if there is no dot.
 */
export function stripExtension(filename) {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return filename;
  }
  return filename.slice(0, lastDot);
}

/**
 * Read all files from dist/ recursively and return their extension-stripped
 * basenames as a Set for fast lookup.
 */
export async function readDistFiles() {
  const allFiles = await readdir(DIST_DIR, {
    withFileTypes: true,
    recursive: true,
  });
  const names = new Set();

  for (const file of allFiles) {
    if (file.isFile()) {
      // With recursive: true, file.path is a string (full relative path).
      // Fall back to file.name for mocked Dirent objects that lack path.
      const fullPath = file.path ?? file.name;
      const baseName = path.basename(fullPath);
      names.add(stripExtension(baseName));
    }
  }

  return names;
}

/**
 * Identify log entries whose (extension-stripped) filename is not present
 * in distFiles. Returns the list of obsolete entries.
 */
export function findObsolete(logEntries, distFiles) {
  const obsolete = [];
  for (const entry of logEntries) {
    const baseName = stripExtension(entry.filename);
    if (!distFiles.has(baseName)) {
      obsolete.push(entry);
    }
  }
  return obsolete;
}

/**
 * Show a confirmation prompt and return true if the user confirms (Y or empty).
 */
export async function askConfirmation(stats) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n=== Log Cleanup ===");
  console.log(`Total entries: ${stats.total}`);
  console.log(`Obsolete entries: ${stats.obsolete}`);
  console.log(`To delete: ${stats.toDelete}`);
  console.log("Proceed? [Y/n]");

  const answer = await rl.question("");
  rl.close();

  const normalized = String(answer).trim().toLowerCase();
  return normalized !== "n";
}

/**
 * Main cleanup function.
 *
 * Connects to MongoDB, fetches log entries, compares against dist/,
 * asks for confirmation, then deletes obsolete entries.
 *
 * @param {object} [options]
 * @param {Set<string>} [options.distFiles] - pre-loaded dist files (for testing)
 * @returns {Promise<{ deleted: number, total: number, obsolete: number }>}
 */
export async function main(options = {}) {
  const distFiles = options.distFiles || (await readDistFiles());
  console.log(`Found ${distFiles.size} file(s) in ${DIST_DIR}.`);

  const connection = await getImageLogConnection();
  const { collection } = connection;
  console.log(
    `Connected to ${connection.collection.db.databaseName}.${connection.collection.collectionName}`,
  );

  try {
    const logEntries = await collection
      .find({}, { projection: { _id: 1, filename: 1 } })
      .toArray();

    const total = await collection.countDocuments();
    console.log(`Fetched ${logEntries.length} log entries.`);

    const obsoleteEntries = findObsolete(logEntries, distFiles);
    const obsolete = obsoleteEntries.length;
    const toDelete = obsoleteEntries.map((entry) => entry._id);

    if (obsolete === 0) {
      console.log("No obsolete entries to clean up.");
      return { deleted: 0, total, obsolete: 0 };
    }

    const confirmed = await askConfirmation({
      total,
      obsolete,
      toDelete: toDelete.length,
    });

    if (!confirmed) {
      console.log("Cleanup aborted.");
      return { deleted: 0, total, obsolete };
    }

    const result = await collection.deleteMany({ _id: { $in: toDelete } });
    console.log(`Deleted ${result.deletedCount} obsolete log entries.`);

    return { deleted: result.deletedCount, total, obsolete };
  } catch (err) {
    console.error(`Error during cleanup: ${err.message}`);
    throw err;
  } finally {
    await connection.client.close();
    console.log("Connection closed.");
  }
}

// Only execute main() when this file is the direct entry point (not when imported).
if (
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
