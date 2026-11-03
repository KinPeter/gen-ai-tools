import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchLogsWithConnection } from "../logging/mongodb/search-logs.mjs";

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

export function parseArgs(argv) {
  const args = {
    filters: {},
    json: false,
    limit: null,
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
      } else {
        // unknown flag, skip
        i++;
      }
    }
  }
  return args;
}

export function printHelp() {
  console.log(`Usage: node log-search.mjs [options]

Search log entries in MongoDB.

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
  --help                Show this help message`);
}

// -- Output formatting -----------------------------------------------------

export function formatLoras(loras) {
  if (!loras || !loras.length) return "(none)";
  return loras.map((l) => `${l.name}`).join(", ");
}

export function formatText(results) {
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
    lines.push(`[${i + 1}] ${e.filename ?? "(unknown)"}`);
    lines.push(`    Workflow: ${e["base-workflow"] ?? "(none)"}`);
    lines.push(`    Prefix: ${e["filename-prefix"] ?? "(none)"}`);
    lines.push(`    Folder: ${e["output-folder"] ?? "(none)"}`);
    lines.push(`    Model: ${e.model ?? "(none)"}`);
    const promptText = String(e.prompt ?? "").replace(/,\s*/g, ", ");
    const shortPrompt =
      promptText.length > 60 ? promptText.slice(0, 57) + "..." : promptText;
    lines.push(`    Prompt: ${shortPrompt}`);
    lines.push(`    Loras: ${formatLoras(e.loras)}`);
    if (i < results.length - 1) lines.push("    ---");
  }
  return lines.join("\n");
}

// -- Main ------------------------------------------------------------------

export async function search(filters, json, limit) {
  const results = await searchLogsWithConnection(filters, limit);
  if (json) {
    console.log(JSON.stringify(results, null, 2));
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
  await search(args.filters, args.json, args.limit);
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await runCLI();
}
