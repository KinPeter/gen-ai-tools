import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LOGS_DIR = "output/logs/";

// -- CLI parsing -----------------------------------------------------------

const FLAG_MAP = new Map([
  ["--workflow", "workflow"],
  ["--prefix", "prefix"],
  ["--lora", "lora"],
  ["--prompt", "prompt"],
  ["--output-folder", "outputFolder"],
  ["--sampler", "sampler"],
  ["--scheduler", "scheduler"],
  ["--model", "model"],
]);

function parseArgs(argv) {
  const args = {
    filters: {},
    json: false,
    limit: null,
    logsDir: DEFAULT_LOGS_DIR,
  };
  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--help") {
      args.help = true;
      i++;
    } else if (arg === "--json") {
      args.json = true;
      i++;
    } else if (arg === "--limit" && argv[i + 1]) {
      args.limit = parseInt(argv[++i], 10);
      i++;
    } else if (arg === "--log-dir" && argv[i + 1]) {
      args.logsDir = argv[++i];
      i++;
    } else {
      const filterKey = FLAG_MAP.get(arg);
      if (filterKey && argv[i + 1]) {
        const value = argv[++i];
        // Accumulate repeated flags into arrays
        if (Array.isArray(args.filters[filterKey])) {
          args.filters[filterKey].push(value);
        } else if (args.filters[filterKey] !== undefined) {
          args.filters[filterKey] = [args.filters[filterKey], value];
        } else {
          args.filters[filterKey] = [value];
        }
        i++;
      } else if (!arg.startsWith("--")) {
        // positional arg = logs directory
        args.logsDir = arg;
        i++;
      } else {
        // unknown flag, skip
        i++;
      }
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node log-search.mjs [options] [log-directory]

Search log entries in output/logs/ (or the directory you specify).

Options:
  --workflow <name>     Match base-workflow (case-insensitive substring)
  --prefix <name>       Match filename-prefix (case-insensitive substring)
  --lora <name>         Match lora name (case-insensitive substring)
  --prompt <phrase>     Match prompt or negative-prompt (repeatable, case-insensitive)
  --output-folder <n>   Match output-folder (case-insensitive substring)
  --sampler <name>      Match sampler (case-insensitive substring)
  --scheduler <name>    Match scheduler (case-insensitive substring)
  --model <name>        Match model (case-insensitive substring)
  --json                Output as JSON array
  --limit <n>           Limit number of results
  --log-dir <path>      Alternative to positional arg for log directory
  --help                Show this help message`);
}

// -- I/O helpers -----------------------------------------------------------

async function collectJsonFiles(dir) {
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

async function loadEntries(logsDir) {
  const files = await collectJsonFiles(logsDir);
  const all = [];
  for (const filePath of files) {
    let data;
    try {
      data = JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      continue;
    }
    const entries = Array.isArray(data) ? data : [data];
    for (const entry of entries) {
      if (entry && typeof entry === "object") {
        all.push({ ...entry, _source: filePath });
      }
    }
  }
  return all;
}

function resolveLogsDir(logsDir) {
  return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
}

// -- Filtering logic -------------------------------------------------------

function toFilterArray(value) {
  return Array.isArray(value) ? value : [value];
}

function matchesFilter(entry, filters) {
  const p = entry.prompt || {};

  if (filters.workflow !== undefined) {
    const val = String(p["base-workflow"] ?? "");
    const values = toFilterArray(filters.workflow);
    if (!values.every((v) => val.toLowerCase().includes(v.toLowerCase()))) {
      return false;
    }
  }

  if (filters.prefix !== undefined) {
    const val = String(p["filename-prefix"] ?? "");
    const values = toFilterArray(filters.prefix);
    if (!values.every((v) => val.toLowerCase().includes(v.toLowerCase()))) {
      return false;
    }
  }

  if (filters.lora !== undefined) {
    const loras = p.loras || [];
    const values = toFilterArray(filters.lora);
    const match = values.every((v) =>
      loras.some((l) => l.name.toLowerCase().includes(v.toLowerCase())),
    );
    if (!match) return false;
  }

  if (filters.prompt !== undefined) {
    const values = toFilterArray(filters.prompt);
    const text = String(p.prompt ?? "").toLowerCase();
    const neg = String(p["negative-prompt"] ?? "").toLowerCase();
    if (
      !values.every(
        (needle) =>
          text.includes(needle.toLowerCase()) ||
          neg.includes(needle.toLowerCase()),
      )
    ) {
      return false;
    }
  }

  if (filters.outputFolder !== undefined) {
    const val = String(p["output-folder"] ?? "");
    const values = toFilterArray(filters.outputFolder);
    if (!values.every((v) => val.toLowerCase().includes(v.toLowerCase()))) {
      return false;
    }
  }

  if (filters.sampler !== undefined) {
    const val = String(p.sampler ?? "");
    const values = toFilterArray(filters.sampler);
    if (!values.every((v) => val.toLowerCase().includes(v.toLowerCase()))) {
      return false;
    }
  }

  if (filters.scheduler !== undefined) {
    const val = String(p.scheduler ?? "");
    const values = toFilterArray(filters.scheduler);
    if (!values.every((v) => val.toLowerCase().includes(v.toLowerCase()))) {
      return false;
    }
  }

  if (filters.model !== undefined) {
    const val = String(p.model ?? "");
    const values = toFilterArray(filters.model);
    if (!values.every((v) => val.toLowerCase().includes(v.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

function filterEntries(entries, filters) {
  if (!filters || !Object.keys(filters).length) return entries;
  return entries.filter((e) => matchesFilter(e, filters));
}

// -- Output formatting -----------------------------------------------------

function formatLoras(loras) {
  if (!loras || !loras.length) return "(none)";
  return loras.map((l) => `${l.name}`).join(", ");
}

function formatText(results) {
  const lines = [];
  if (results.length === 0) {
    return "No matching entries found.";
  }
  lines.push(
    `Found ${results.length} matching ${results.length === 1 ? "entry" : "entries"}:`,
  );
  lines.push("");
  for (let i = 0; i < results.length; i++) {
    const e = results[i];
    const p = e.prompt || {};
    lines.push(`[${i + 1}] ${e.filename ?? "(unknown)"}`);
    lines.push(`    Workflow: ${p["base-workflow"] ?? "(none)"}`);
    lines.push(`    Prefix: ${p["filename-prefix"] ?? "(none)"}`);
    lines.push(`    Folder: ${p["output-folder"] ?? "(none)"}`);
    lines.push(`    Model: ${p.model ?? "(none)"}`);
    const promptText = String(p.prompt ?? "").replace(/,\s*/g, ", ");
    const shortPrompt =
      promptText.length > 60 ? promptText.slice(0, 57) + "..." : promptText;
    lines.push(`    Prompt: ${shortPrompt}`);
    lines.push(`    Loras: ${formatLoras(p.loras)}`);
    if (i < results.length - 1) lines.push("    ---");
  }
  return lines.join("\n");
}

// -- Main ------------------------------------------------------------------

async function search(logsDir, filters, json, limit) {
  const dir = resolveLogsDir(logsDir);
  const all = await loadEntries(dir);
  const results = filterEntries(all, filters);

  if (limit !== null && results.length > limit) {
    results.length = limit;
  }

  if (json) {
    // Strip internal _source field for clean JSON output
    const clean = results.map((e) => {
      const rest = { ...e };
      delete rest._source;
      return rest;
    });
    console.log(JSON.stringify(clean, null, 2));
  } else {
    console.log(formatText(results));
  }
}

export async function runCLI(argv) {
  const args = parseArgs(argv ?? process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await search(args.logsDir, args.filters, args.json, args.limit);
}

export {
  search,
  filterEntries,
  matchesFilter,
  toFilterArray,
  collectJsonFiles,
  loadEntries,
  formatText,
  formatLoras,
  parseArgs,
};

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await runCLI();
}
