# Logging

ComfyUI generation logs live in MongoDB: database `gen-ai`, collection `image-logs`, one document per image keyed by the extension-stripped filename. Needs `MONGODB_URI` in `.env`.

| Command                                                  | What it does                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node logging/mongodb/find-log.mjs <filename>`           | print the log entry for an image (accepts a path, any extension)                                                                                  |
| `node agent-tools/log-search.mjs [filters]`              | search entries by `--workflow`, `--prefix`, `--lora`, `--prompt`, `--output-folder`, `--sampler`, `--scheduler`, `--model`; `--limit n`, `--json` |
| `npm run log-cleanup`                                    | delete entries that have no matching file in `dist/` (asks Y/n)                                                                                   |
| `npm run log-backup`                                     | dump the collection to `output/backup/logs_<timestamp>.json` in 3,000-entry chunks                                                                |
| `node logging/mongodb/bulk-upload-log.mjs a.json,b.json` | insert entries from JSON log files in batches of 3,000                                                                                            |

Log Finder UI: run `npm run tools-hub`, then open `/logfinder` (page at `logging/logfinder-ui/index.html`, backed by `/api/logging/find-log`).

Run the tests with `npm run test:coverage` — the logging scripts are covered under `test/logging/mongodb/`.
