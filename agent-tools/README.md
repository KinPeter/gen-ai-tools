# Agent tools

Three Node CLI scripts written for AI agents to call through their shell tool: validate a batch input YAML, look up one image's log entry, search the log collection. There are no npm scripts for them — run them directly from the repo root.

| Command                                      | What it does                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `node agent-tools/validate-input.mjs <yaml>` | validates a ComfyUI batch input file against the job schema; prints VALID/INVALID and exits 0/1.         |
| `node agent-tools/lookup-log.mjs <filename>` | prints the MongoDB log entry for one image as JSON; exits 1 when there is no entry.                      |
| `node agent-tools/log-search.mjs [filters]`  | searches log entries by workflow, prefix, lora, prompt, folder, sampler, scheduler, model; text or JSON. |

The two log scripts talk to MongoDB (`gen-ai` / `image-logs`) and need `MONGODB_URI` in `.env`; validation only reads the YAML file.

## validate-input

```sh
node agent-tools/validate-input.mjs comfyui/inputs/input.example.yaml
```

```text
--- VALIDATION RESULT ---
Status: VALID
Items: 3
--- END ---
```

Invalid files give the same block with `Status: INVALID` and an indented list of errors — file not found, YAML syntax error, top-level value that is not a list, or a schema violation (`base-workflow` and a non-empty `prompts` list are required; `steps`, `cfg`, `seed`, `tries`, `size`, `loras`, `clip-skip` are type-checked when present). Missing argument prints a usage line and exits 1.

## lookup-log

```sh
node agent-tools/lookup-log.mjs rover_20261003212855.png
```

The argument may be a bare name, a relative path or an absolute path; the basename is taken and `.jpg`, `.jpeg`, `.png` are stripped before the lookup. Output is the entry as pretty-printed JSON.

## log-search

```sh
node agent-tools/log-search.mjs --workflow juggernaut --prompt "black dress" --limit 10
node agent-tools/log-search.mjs --lora cyberpunk --model sdxl --json
node agent-tools/log-search.mjs --help
```

| Flag              | Matches                                    |
| ----------------- | ------------------------------------------ |
| `--workflow`      | `base-workflow`                            |
| `--prefix`        | `filename-prefix`                          |
| `--lora`          | `loras[].name`                             |
| `--prompt`        | `prompt` or `negative-prompt`              |
| `--output-folder` | `output-folder`                            |
| `--sampler`       | `sampler`                                  |
| `--scheduler`     | `scheduler`                                |
| `--model`         | `model`                                    |
| `--limit <n>`     | caps the number of results                 |
| `--json`          | full JSON array instead of the text digest |

Every match is a case-insensitive substring. Repeat a flag to AND several values. Default output is a compact digest (filename, workflow, prefix, folder, model, prompt trimmed to 57 chars + `…`, LoRA names) — good for a first pass; `--json` returns the whole documents. Unknown flags are ignored, so a mistyped filter silently narrows nothing.
