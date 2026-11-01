import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LOGS_DIR = "output/logs/";

export function normalizeToPngFilename(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const forward = raw.replace(/\\/g, "/");
  const base = path.posix.basename(forward);
  if (!base) return null;
  const name = path.parse(base).name;
  if (!name) return null;
  return `${name}.png`;
}

export async function collectJsonFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "ENOENT") return found;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectJsonFiles(full)));
    } else if (path.extname(entry.name).toLowerCase() === ".json") {
      found.push(full);
    }
  }
  return found.sort();
}

export async function findLogEntry({ logsDir, file, targetFilename }) {
  const files = file ? [file] : await collectJsonFiles(logsDir);
  for (const filePath of files) {
    let data;
    try {
      data = JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      console.warn(`Skipping unreadable log file: ${filePath}`);
      continue;
    }
    const entries = Array.isArray(data) ? data : [data];
    for (const entry of entries) {
      if (
        entry &&
        typeof entry === "object" &&
        entry.filename === targetFilename
      ) {
        return { entry, sourceFile: filePath };
      }
    }
  }
  return null;
}

export function parseArgs(argv) {
  const args = { logsDir: DEFAULT_LOGS_DIR, file: null, positional: [] };
  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--logs-dir" && argv[i + 1]) {
      args.logsDir = argv[++i];
    } else if (arg === "--file" && argv[i + 1]) {
      args.file = argv[++i];
    } else if (!arg.startsWith("--")) {
      args.positional.push(arg);
    }
    i++;
  }
  return args;
}

export function resolveLogsDir(logsDir) {
  return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
}

async function lookupAndPrint(logsDir, file, rawInput) {
  const target = normalizeToPngFilename(rawInput);
  if (!target) {
    console.error(
      `Could not parse a filename from: ${JSON.stringify(rawInput.trim())}`,
    );
    return;
  }
  const found = await findLogEntry({ logsDir, file, targetFilename: target });
  if (!found) {
    console.error(`No log entry found for filename: ${target}`);
    return;
  }
  console.log(JSON.stringify(found.entry, null, 2));
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = parseArgs(process.argv);
  const logsDir = resolveLogsDir(args.logsDir);
  const hasInput = args.positional.length > 0 || args.file;

  if (!hasInput) {
    console.error(
      "No arguments provided. Usage: node lookup-log.mjs [filename] [--file <logfile>] [--logs-dir <dir>]",
    );
    process.exit(1);
  }

  const input = args.positional[0] || "";
  await lookupAndPrint(logsDir, args.file, input);
  process.exit(0);
}
