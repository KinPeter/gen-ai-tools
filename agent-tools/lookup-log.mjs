import path from "node:path";
import { fileURLToPath } from "node:url";
import { findWithConnection } from "../logging/mongodb/find-log.mjs";

export function parseArgs(argv) {
  return { positional: argv[2] ? [argv[2]] : [] };
}

export async function runLookup() {
  const args = parseArgs(process.argv);
  const input = args.positional[0];

  if (!input) {
    console.error(
      "No arguments provided. Usage: node lookup-log.mjs <filename>",
    );
    process.exit(1);
  }

  await findWithConnection(input);
  process.exit(0);
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await runLookup();
}
