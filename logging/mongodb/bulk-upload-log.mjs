import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import { uploadLog } from "./upload-log.mjs";
import { getImageLogConnection } from "./client.mjs";

/**
 * Parse comma-separated file paths from the command line.
 * Supports both a single "a.json,b.json" argument or multiple positional args.
 */
export function parseArgs() {
  const paths = process.argv.slice(2).flatMap((arg) => arg.split(","));
  if (paths.length === 0) {
    console.error(
      "Usage: node bulk-upload-log.mjs /path/to/log1.json,/path/to/log2.json",
    );
    process.exit(1);
  }
  return paths.filter(Boolean);
}

const DEFAULT_BATCH_SIZE = 3_000;

/**
 * Read a JSON file and validate it contains an array.
 */
export function readLogEntries(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new TypeError(
      `${filePath}: expected a JSON array of log entries, got ${typeof parsed}`,
    );
  }
  return parsed;
}

/**
 * Upload entries in batches to avoid exceeding MongoDB's BSON document limit.
 */
export async function bulkUpload(entries, connection, batchSize) {
  const total = entries.length;
  let offset = 0;
  let uploaded = 0;

  while (offset < total) {
    const batch = entries.slice(offset, offset + batchSize);
    const { uploaded: batchCount } = await uploadLog(batch, connection);
    uploaded += batchCount;
    console.log(
      `Batch ${Math.floor(offset / batchSize) + 1}: inserted ${batchCount}/${batch.length} entries.`,
    );
    offset += batchSize;
  }

  return { uploaded };
}

export async function main() {
  const filePaths = parseArgs();
  const batchSize = DEFAULT_BATCH_SIZE;

  // Read all entries from all files
  const allEntries = [];
  for (const filePath of filePaths) {
    const entries = readLogEntries(filePath);
    console.log(`Read ${entries.length} entries from ${filePath}`);
    allEntries.push(...entries);
  }

  console.log(`Total entries: ${allEntries.length}`);

  // Connect to MongoDB
  const connection = await getImageLogConnection();
  console.log(
    `Connected to ${connection.collection.db.databaseName}.${connection.collection.collectionName}`,
  );

  // Upload in batches
  try {
    const { uploaded } = await bulkUpload(allEntries, connection, batchSize);
    console.log(`Inserted ${uploaded} entries into MongoDB.`);
  } catch (err) {
    const entryWord = allEntries.length === 1 ? "entry" : "entries";
    console.error(
      `Error uploading ${allEntries.length} ${entryWord}: ${err.message}`,
    );
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
