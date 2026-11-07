# Logging Module

## Purpose

Store and retrieve ComfyUI generation log entries in MongoDB — database `gen-ai`, collection `image-logs`. One document per generated image, keyed by `filename`, the image basename with the extension stripped. Requires `MONGODB_URI`.

## Connection

`logging/mongodb/client.mjs` — `getImageLogConnection()` returns a connected `{ client, collection }` pair. Throws if `MONGODB_URI` is missing, uses `serverApi: { strict: true }` and a 2–10 pool, and pings the server before returning. A fresh client is created per call; the caller must `client.close()`.

`tools-hub/utils/db.mjs` keeps one persistent client for the API routes (`getImageLogCollection()`).

## Scripts (`logging/mongodb/`)

| File                  | What it does                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload-log.mjs`      | `uploadLog(entries, connection)` — `insertMany` (ordered), keys entries by `stripExtension(filename)`, skips entries with no filename. Throws on failure; callers catch it so the batch continues.                                                                                                                                 |
| `bulk-upload-log.mjs` | CLI: `node logging/mongodb/bulk-upload-log.mjs a.json,b.json` — reads JSON arrays from the given files and inserts in batches of 3,000. Importable.                                                                                                                                                                                |
| `find-log.mjs`        | CLI: `node logging/mongodb/find-log.mjs <filename-or-path>` — prints the matching entry as JSON; exits 1 when not found.                                                                                                                                                                                                           |
| `search-logs.mjs`     | `searchLogs(filters, connection, limit)` / `searchLogsWithConnection(filters, limit)` — case-insensitive regex filters on `workflow`, `prefix`, `outputFolder`, `lora` (matches `loras[].name`), `prompt` (also `negative-prompt`), `sampler`, `scheduler`, `model`. Repeated values AND together; `_id` is stripped from results. |
| `cleanup-log.mjs`     | `npm run log-cleanup` — deletes entries with no matching file in `dist/`, after a Y/n prompt.                                                                                                                                                                                                                                      |
| `backup-log.mjs`      | `npm run log-backup` — dumps the whole collection to `output/backup/logs_<timestamp>[_n].json`, 3,000 entries per file.                                                                                                                                                                                                            |

Filename helpers: `logging/utils.mjs` exports `stripExtension(filename)` (removes only the last extension, after basename + backslash normalization). `find-log.mjs` has its own `normalizeFilename`, which strips only `.jpg`, `.jpeg`, `.png`.

## Document shape

Flat — every field at the top level: `filename`, `base-workflow`, `output-folder`, `filename-prefix`, `loras`, `lora-strengths`, `clip-skip`, `tries`, `size`, `model`, `prompt`, `negative-prompt`, `steps`, `cfg`, `sampler`, `scheduler`, `seed`, `generatedIn` (formatted `m:ss`), `comfyJobId`.

## Consumers

- `comfyui/jobs/log.mjs` — uploads the entries for each saved image after a generation.
- `tools-hub/api/logging/find-log.mjs` — `GET /api/logging/find-log?filename=<image>`, backed by `findLogEntry` + `normalizeFilename`.
- `logging/logfinder-ui/index.html` — single-file UI (filename input, drag-and-drop) served by `tools-hub/static/logfinder` at `/logfinder`; calls the API above.
- `agent-tools/lookup-log.mjs`, `agent-tools/log-search.mjs` — CLI lookup and search used by the image helper agents.

`logging/temp-scripts/` holds one-off log-processing helpers; they are excluded from the coverage gate.

## Testing

Tests mirror the scripts under `test/logging/mongodb/`. Every `logging/**/*.mjs` outside `temp-scripts/` must pass the 90% per-file line coverage threshold.
