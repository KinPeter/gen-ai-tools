import { fileURLToPath } from "node:url";
import path from "node:path";
import { getImageLogConnection } from "./client.mjs";

/**
 * Regex matching common image extensions (case-insensitive).
 *
 * Intentionally narrower than `stripExtension` in `logging/utils.mjs`,
 * which strips *any* last extension. Here we only strip known image
 * extensions (.jpg, .jpeg, .png) because `find-log` works with the
 * `image-logs` collection that only contains image entries.
 */
const FILE_EXTENSIONS = /\.(jpg|jpeg|png)$/i;

/**
 * Normalize a filename or path to its stripped basename.
 * Strips path segments and the file extension (if present).
 *
 * @param {string} input - filename, relative path, or absolute path.
 * @returns {string} The stripped basename without path or extension.
 */
export function normalizeFilename(input) {
  // Coerce to string and trim whitespace for robustness (paranoia: callers
  // always pass strings, but guard against null/undefined from argv).
  const value = String(input ?? "").trim();
  const normalized = value.replace(/\\/g, "/");
  const basename = path.basename(normalized);
  return basename.replace(FILE_EXTENSIONS, "");
}

/**
 * Find a log entry by stripped filename.
 *
 * @param {string} strippedFilename - filename with no path or extension.
 * @param {object} connection - { client, collection } pair from getImageLogConnection.
 * @returns {Promise<object|null>} The document with _id removed, or null if not found.
 */
export async function findLogEntry(strippedFilename, connection) {
  const { collection } = connection;
  const entry = await collection.findOne({ filename: strippedFilename });
  if (entry == null) {
    return null;
  }
  const cloned = { ...entry };
  delete cloned._id;
  return cloned;
}

export async function findWithConnection(input) {
  const strippedFilename = normalizeFilename(input);
  console.log(`Looking up: ${strippedFilename}`);

  const connection = await getImageLogConnection();
  try {
    const entry = await findLogEntry(strippedFilename, connection);
    if (!entry) {
      console.error(`No log entry found for: ${strippedFilename}`);
      process.exit(1);
    }
    console.log(JSON.stringify(entry, null, 2));
    return entry;
  } catch (err) {
    console.error(
      `Error looking up log for ${strippedFilename}: ${err.message}`,
    );
    throw err;
  } finally {
    // Guard against client being null (low risk since client.mjs always
    // returns a valid MongoClient, but safe to be defensive).
    if (connection.client) {
      await connection.client.close();
    }
    console.log("Connection closed.");
  }
}

/**
 * CLI entry point: parses args, looks up the log, prints JSON.
 */
export async function main() {
  const input = process.argv[2];
  if (typeof input !== "string" || input === "") {
    console.error("Usage: node find-log.mjs <filename-or-path>");
    process.exit(1);
  }

  await findWithConnection(input);
}

// Only execute main() when this file is the direct entry point.
if (
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
