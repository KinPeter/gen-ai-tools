import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { validateJobData } from "../comfyui/workflow-builder/validation.mjs";

const BANNER = "--- VALIDATION RESULT ---";
const FOOTER = "--- END ---";
const EXIT_VALID = 0;
const EXIT_INVALID = 1;

// ---- parsing (pure) ----

function parseYaml(text) {
  return parse(text);
}

// ---- validation (pure — delegates to validation.mjs) ----

function validateData(data) {
  // validateJobData silently accepts non-null non-array data (no-op
  // guard: !Array.isArray returns without error). Callers that use
  // validateData directly may get a no-op result where validateInputFile
  // would reject the same data via its pre-check.
  validateJobData(data);
}

function assertIsArray(data) {
  return data == null || Array.isArray(data);
}

// ---- output formatting (pure) ----

function formatValid(data) {
  const itemCount = Array.isArray(data) ? data.length : "n/a";
  return [BANNER, "Status: VALID", `Items: ${itemCount}`, FOOTER];
}

function formatInvalid(errors) {
  const lines = [BANNER, "Status: INVALID", "Errors:"];
  for (const err of errors) {
    lines.push(`  ${err}`);
  }
  lines.push(FOOTER);
  return lines;
}

function formatError(message) {
  return [BANNER, "Status: INVALID", "Errors:", `  "${message}"`, FOOTER];
}

// ---- I/O ----

async function readYamlFile(filePath) {
  const absolutePath = resolve(filePath);
  const text = await readFile(absolutePath, "utf8");
  return { text, path: absolutePath };
}

// ---- orchestration ----

async function validateInputFile(filePath) {
  let text;
  let parsed;

  try {
    const file = await readYamlFile(filePath);
    text = file.text;
  } catch (err) {
    return {
      valid: false,
      messages: formatError(`file read error: ${err?.message ?? String(err)}`),
      exitCode: EXIT_INVALID,
    };
  }

  try {
    parsed = parseYaml(text);
  } catch (err) {
    return {
      valid: false,
      messages: formatError(`parse error: ${err?.message ?? String(err)}`),
      exitCode: EXIT_INVALID,
    };
  }

  if (!assertIsArray(parsed)) {
    return {
      valid: false,
      messages: formatError(`"${typeof parsed}" data, expected a YAML list`),
      exitCode: EXIT_INVALID,
    };
  }

  try {
    validateData(parsed);
    return {
      valid: true,
      messages: formatValid(parsed),
      exitCode: EXIT_VALID,
    };
  } catch (err) {
    const errMessage = err?.message ?? String(err);
    return {
      valid: false,
      messages: formatError(errMessage),
      exitCode: EXIT_INVALID,
    };
  }
}

async function main(yamlPath) {
  const result = await validateInputFile(yamlPath);
  for (const line of result.messages) {
    console.log(line);
  }
  process.exit(result.exitCode);
}

// ---- CLI entry ----

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const yamlPath = process.argv[2] ?? process.cwd();
  if (yamlPath === process.cwd()) {
    console.error("Usage: node validate-input.mjs <path-to-yaml>");
    process.exit(EXIT_INVALID);
  }
  await main(yamlPath);
}

export {
  validateInputFile,
  readYamlFile,
  parseYaml,
  validateData,
  formatInvalid,
  formatError,
  formatValid,
  EXIT_INVALID,
};
