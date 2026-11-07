# Agent Tools Module

## Purpose

Thin CLI wrappers that agent subagents call with their shell tool: validate a ComfyUI batch input YAML, fetch one image's log entry, search the log collection. Usage documentation is in [README.md](./README.md).

## Scripts

| File                 | Shape                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `validate-input.mjs` | `validateInputFile(path)` → `{ valid, messages, exitCode }`; main prints the lines and exits 0/1. |
| `lookup-log.mjs`     | `runLookup()` → delegates to `logging/mongodb/find-log.mjs` `findWithConnection(input)`.          |
| `log-search.mjs`     | `runCLI(argv)` → `parseArgs` → `searchLogsWithConnection(filters, limit)` → `formatText` or JSON. |

All three are importable: every script guards its CLI entry with an `isMain` check (`process.argv[1]` resolved against `import.meta.url`), so importing them never runs the database or exits the process.

## validate-input.mjs

No database access. Read → parse (`yaml`) → assert the top level is null or an array → `validateJobData` from `comfyui/workflow-builder/validation.mjs`, which throws on the first bad field. Errors are caught and rendered as the `Status: INVALID` block; the exit code is the signal for the calling agent.

`validateData` is exported separately and is a no-op for non-array input (inherited from `validateJobData`); the array check lives in `validateInputFile`, so use that one for real validation.

## lookup-log.mjs

Takes exactly one positional argument; anything else is ignored. Normalization and printing are done by `findWithConnection` (basename, strips `.jpg`/`.jpeg`/`.png`, prints the entry as JSON, exits 1 when not found). No `--json` flag — output is always JSON.

## log-search.mjs

`FLAG_MAP` maps each CLI flag to the filter key understood by `buildQuery` in `logging/mongodb/search-logs.mjs` (`workflow`, `prefix`, `outputFolder`, `lora`, `prompt`, `sampler`, `scheduler`, `model`). Repeated flags accumulate into an array, which the query builder ANDs. Flags without a value, and unknown flags, are skipped without error.

Text output is a deliberate digest: one entry per block, prompt cut at 60 chars (`57...`), LoRA names joined by commas, no `generatedIn`/`seed`/`size`. The full documents only come from `--json`.

## Requirements

- `MONGODB_URI` in `.env` for `lookup-log.mjs` and `log-search.mjs` (loaded by `logging/mongodb/client.mjs`).
- Nothing else; run from the repo root so the relative imports resolve.

## Consumers

The image helper agents in `.opencode/agents/` — `image-input-validator`, `image-log-finder`, `image-log-searcher` — each have a shell permission restricted to a single script (`node agent-tools/<script> *`). They are OpenCode-only, no Claude Code mirrors.

## Testing

Unit tests in `test/agent-tools/` mock `findWithConnection` / `searchLogsWithConnection` and exercise argument parsing, formatting, and exit codes; fixtures under `test/agent-tools/fixtures/` cover valid, invalid, empty, non-array and malformed YAML. These files are not part of the per-file coverage gate (`vitest.config.mjs` only includes `comfyui`, `runpod`, `logging`, `tools-hub`).
