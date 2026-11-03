import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getImageLogConnection } from "./client.mjs";
import { destFileName, timestamp } from "../../comfyui/utils/naming.mjs";

const ENTRIES_PER_FILE = 3_000;
const OUTPUT_DIR = "output/backup";

/**
 * Split an array into chunks of the given size.
 */
export function chunkEntries(entries, chunkSize) {
  if (entries.length === 0) {
    return [[]];
  }
  if (chunkSize === 0) {
    return [entries.slice()];
  }
  const chunks = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Fetch all log entries from MongoDB and strip the _id from each.
 */
export async function fetchLogEntries(connection) {
  const { collection } = connection;
  const entries = await collection.find().toArray();
  return entries.map((entry) => {
    const cloned = { ...entry };
    delete cloned._id;
    return cloned;
  });
}

/**
 * Build the output filename for a given chunk index (1-based).
 * Delegates to destFileName from comfyui/utils/naming.mjs.
 * Format: logs_<YYYYMMDDHHmmss>.json (first) or logs_<YYYYMMDDHHmmss>_<n>.json
 */
export function buildOutputFilename(n) {
  return destFileName({
    prefix: "logs",
    ts: timestamp(),
    index: n - 1,
    ext: ".json",
  });
}

/**
 * Write an entries array to a JSON file.
 */
export function writeBackupFile(entries, outputPath) {
  writeFileSync(outputPath, JSON.stringify(entries, null, 2), "utf-8");
  return outputPath;
}

export async function main() {
  const connection = await getImageLogConnection();
  const ts = timestamp();

  const entries = await fetchLogEntries(connection);
  console.log(`Fetched ${entries.length} log entries from MongoDB`);

  if (entries.length === 0) {
    console.log("No entries to backup.");
    await connection.client.close();
    console.log("Connection closed.");
    return { entries, fileCount: 0, timestamp: ts };
  }

  const chunks = chunkEntries(entries, ENTRIES_PER_FILE);
  const fileCount = chunks.length;
  console.log(
    `Split into ${fileCount} file(s) (${ENTRIES_PER_FILE} entries per file)`,
  );

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (let i = 0; i < fileCount; i++) {
    const filename = destFileName({
      prefix: "logs",
      ts,
      index: i,
      ext: ".json",
    });
    const outputPath = path.resolve(OUTPUT_DIR, filename);
    console.log(
      `Writing to ${OUTPUT_DIR}/${filename} (${chunks[i].length} entries)`,
    );
    writeBackupFile(chunks[i], outputPath);
  }

  console.log(`Wrote ${fileCount} backup file(s) to ${OUTPUT_DIR}/`);

  try {
    await connection.client.close();
    console.log("Connection closed.");
  } catch (err) {
    console.error("Failed to close connection:", err.message);
  }

  return { entries, fileCount, timestamp: ts };
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
