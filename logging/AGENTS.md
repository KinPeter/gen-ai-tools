# Logging Module

## Purpose

Store and retrieve ComfyUI generation log entries via DynamoDB, deploy a Lambda handler and browser UI for lookup.

## Architecture

### DynamoDB upload

`uploadLog(logEntries)` exports a function that uploads log entries to DynamoDB. Each entry is keyed by image basename (without extension), with `data` holding the JSON-stringified log entry. Used by the ComfyUI log writer after every `writeLog`. Failures only `console.error` — never blocks the pipeline.

- Table name resolved from `TABLE_NAME` or `AWS_LOGS_TABLE_NAME` env vars
- `stripExtension(filename)` normalizes filenames for key matching

### Lambda handler

`log-find-lambda` — AWS Lambda handler for `GET ?filename=<image>`. Looks up the run-log entry in DynamoDB by basename (without extension). Returns JSON with the full log entry.

- Uses `DynamoDBDocumentClient` for typed queries
- `normalizeFilename()` mirrors `stripExtension` for query param matching

### Lambda deployment

Zips the handler and publishes it via `UpdateFunctionCodeCommand`. Handler name stays `<basename>.handler`.

- Requires: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_LOGS_FIND_LAMBDA_NAME`
- Uses `zip` binary from PATH

### Browser UI build

Builds a single-file HTML UI that injects the Lambda URL into a template with a `__LOG_FIND_LAMBDA_URL__` placeholder. Output goes to `logging/dist/index.html` (gitignored).

- Template is `logging/log-find-ui.html`
- Refuses to write if the placeholder is missing

### Browser UI deployment

Uploads the built `index.html` via plain FTP (insecure — provider cert doesn't match the FTP hostname, so FTPS fails).

- Requires: `FTP_HOST` (bare hostname), `FTP_USER`, `FTP_PASS`, `LOG_FIND_UI_FTP_FOLDER`
- Overwrites `index.html` in the target folder

### Log cleanup

Scans log files under a directory, verifies `dist/` exists, and reports which entries are reachable.

### Local lookup

`find-log-from-files` reads run logs from `output/logs/` on disk for local debugging by image filename.

### Testing

All `logging/**/*.mjs` are covered by Vitest with a 90% per-file line threshold. One exception: `logging/temp-scripts/` holds one-off migration helpers (separate README) and is excluded from coverage.
