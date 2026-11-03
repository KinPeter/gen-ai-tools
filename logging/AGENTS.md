# Logging Module

## Purpose

Store and retrieve ComfyUI generation log entries via **MongoDB** (primary), with DynamoDB (legacy) support. Provides local scripts and browser UI for lookup.

## Architecture

### MongoDB (new primary)

#### Client

`logging/mongodb/client.mjs` — `getImageLogConnection()` returns a connected `{ client, collection }` pair. Connects to the `gen-ai.image-logs` collection, reads `MONGODB_URI`, and uses `serverApi: { strict: true }`. A fresh client is created per call; the caller must close it.

#### Per-call upload

`logging/mongodb/upload-log.mjs` — `uploadLog(logEntries, connection)` inserts entries into MongoDB via `insertMany`. Each entry is keyed by stripped filename (no extension). Failures only `console.error` — never blocks the pipeline.

#### Bulk upload

`logging/mongodb/bulk-upload-log.mjs` — Script that reads JSON log files and uploads entries in batches (default 3,000) to avoid BSON document limits. Run directly or import as a module.

- Parses comma-separated file paths from CLI args.
- Validates input arrays; skips entries with empty `filename`.

### DynamoDB (legacy)

#### DynamoDB upload

`logging/upload-log.mjs` — `uploadLog(logEntries, { docClient })` uploads log entries to DynamoDB via `PutCommand` upserts. Each entry is keyed by image basename (without extension), with `data` holding the JSON-stringified log entry. Used by the ComfyUI log writer after every `writeLog`. Failures only `console.error` — never blocks the pipeline.

- Table name resolved from `TABLE_NAME` or `AWS_LOGS_TABLE_NAME` env vars
- `stripExtension(filename)` normalizes filenames for key matching

#### Lambda handler

`logging/log-find-lambda.mjs` — AWS Lambda handler for `GET ?filename=<image>`. Looks up the run-log entry in DynamoDB by basename (without extension). Returns JSON with the full log entry.

- Uses `DynamoDBDocumentClient` for typed queries
- `normalizeFilename()` mirrors `stripExtension` for query param matching

#### Lambda deployment

`logging/deploy-find-lambda.mjs` — Zips the handler and publishes it via `UpdateFunctionCodeCommand`. Handler name stays `<basename>.handler`.

- Requires: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_LOGS_FIND_LAMBDA_NAME`
- Uses `zip` binary from PATH

### Browser UI build

`logging/build-find-ui.mjs` — Builds a single-file HTML UI that injects the Lambda URL into a template with a `__LOG_FIND_LAMBDA_URL__` placeholder. Output goes to `logging/dist/index.html` (gitignored).

- Template is `logging/log-find-ui.html`
- Refuses to write if the placeholder is missing

### Browser UI deployment

`logging/deploy-find-ui.mjs` — Uploads the built `index.html` via plain FTP (insecure — provider cert doesn't match the FTP hostname, so FTPS fails).

- Requires: `FTP_HOST` (bare hostname), `FTP_USER`, `FTP_PASS`, `LOG_FIND_UI_FTP_FOLDER`
- Overwrites `index.html` in the target folder

### Log cleanup

`logging/log-cleanup.mjs` — Scans log files under `output/logs/`, verifies `dist/` exists, filters by whether corresponding JPG exists, and writes a consolidated log file. Interactive by default (reads Y/n from TTY).

### Local lookup

`find-log-from-files` reads run logs from `output/logs/` on disk for local debugging by image filename.

### Migration helpers

`logging/temp-scripts/` holds one-off migration helpers:

| Script                                 | Purpose                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `match-log-entries-to-dist.mjs`        | Scans `output/logs` and `dist` to find matching entries.        |
| `upload-matching-logs-to-dynamodb.mjs` | Uploads matching entries to DynamoDB (sequential `PutCommand`). |
| `flatten-logs.mjs`                     | Flattens nested log structures.                                 |

See `logging/temp-scripts/README.md` for usage details.

## Migration status

**Transitioning from DynamoDB + Lambda to MongoDB + local scripts.**

- **New primary:** `logging/mongodb/` — direct MongoDB, no Lambda, no FTP.
- **Legacy:** `logging/upload-log.mjs`, `logging/log-find-lambda.mjs`, `logging/deploy-find-lambda.mjs`, `logging/build-find-ui.mjs`, `logging/deploy-find-ui.mjs` — all DynamoDB/Lambda/FTP stack.
- **Migration helpers:** `logging/temp-scripts/` — one-off helpers, excluded from coverage gate.

## Testing

| Test location           | Coverage                                             |
| ----------------------- | ---------------------------------------------------- |
| `test/logging/mongodb/` | MongoDB client, upload, bulk-upload                  |
| `test/logging/`         | DynamoDB upload, Lambda handler, UI build, UI deploy |

All `logging/**/*.mjs` (except `temp-scripts/`) are measured by the 90% per-file line coverage gate.
