import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = path.join(import.meta.dirname, "..", "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output", "logs");

// Keys from the target log format that we carry forward
const TARGET_KEYS = new Set([
  "base-workflow",
  "output-folder",
  "filename-prefix",
  "loras",
  "clip-skip",
  "tries",
  "prompt",
  "model",
  "negative-prompt",
  "steps",
  "cfg",
  "sampler",
  "scheduler",
  "seed",
  "filename",
  "generatedIn",
  "comfyJobId",
  "lora-strengths",
  "size",
]);

/**
 * Flatten one log entry: lift the "prompt" object's keys to root level.
 * Keys that the target format knows about are carried forward.
 */
function flattenEntry(entry) {
  const flattened = {};

  // Lift prompt fields to root, keeping only recognized keys
  const p = entry.prompt;
  if (p) {
    for (const key of Object.keys(p)) {
      if (TARGET_KEYS.has(key)) {
        flattened[key] = p[key];
      }
    }
  }

  // Copy root-level fields we recognize
  for (const key of Object.keys(entry)) {
    if (key === "prompt") continue;
    if (TARGET_KEYS.has(key)) {
      flattened[key] = entry[key];
    }
  }

  // Strip .png extension from filename
  if (flattened.filename && typeof flattened.filename === "string") {
    flattened.filename = flattened.filename.replace(/\.png$/, "");
  }

  return flattened;
}

export async function flattenLogEntries(inputPath) {
  const text = await readFile(inputPath, "utf8");
  const entries = JSON.parse(text);

  const flattened = entries.map(flattenEntry);
  return flattened;
}

export async function writeFlattenedLogs(flatEntries, outputDir) {
  const ts = new Date().toISOString().replace(/[-T:Z.]/g, "");
  const outName = `flattened_logs_${ts}.json`;
  const outPath = path.join(outputDir, outName);

  await writeFile(outPath, JSON.stringify(flatEntries, null, 2));
  return outPath;
}

// CLI entry point
if (import.meta.filename === process.argv[1] || process.argv[2]) {
  const input = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(OUTPUT_DIR, "logs_20261102154645.json");

  const entries = await flattenLogEntries(input);
  const outPath = await writeFlattenedLogs(entries, OUTPUT_DIR);

  console.log(
    `Processed ${entries.length} entries → ${path.relative(PROJECT_ROOT, outPath)}`,
  );
}
