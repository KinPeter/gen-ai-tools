# ComfyUI Module

## Purpose

Generate images via ComfyUI — workflow building, job execution, output handling, logging.

## Architecture

`batch.mjs` is a thin orchestrator — everything meaningful lives in its submodules:

- **Workflow builder** (`workflow-builder/`) — converts input YAML + base workflow JSON into a ComfyUI-queueable workflow JSON.
- **Job execution** (`jobs/comfy.mjs`) — POSTs to `/prompt`, polls `/history/{id}` until `status_str === "success"`.
- **Output saving** (`jobs/save.mjs`) — fetches images via `/view`, writes PNGs, checks path safety.
- **PNG→JPG conversion** (`jobs/convert.mjs`) — uses Sharp, quality 90, mirrors `output/` subfolders into `dist/`.
- **Log writing** (`jobs/log.mjs`) — builds log entries, writes JSON, calls `logging/upload-log.mjs` for DynamoDB.

### Workflow builder

`loadWorkflows(inputName)` reads an input YAML from `comfyui/inputs/`, merges it over a base workflow from `comfyui/workflows/`, and returns a queueable workflow JSON.

**Input YAML conventions:**
- Top-level list of blocks; every block **must** have a `prompts` list.
- Per-prompt overrides (`tries`, `seed`, `prompt`, `negative-prompt`, `loras`, `clip-skip`) take precedence over parent.
- `base-workflow: <name>` loads `comfyui/workflows/<name>.json` (`.json` suffix optional). Applies `steps`/`cfg`/`size`/`filename-prefix` when set.
- `tries` must be int ≥ 1, default 1. `loras` is a list of `{name, strength}` (at least one) that wires into a `LoraLoader` chain. `clip-skip` overrides `stop_at_clip_layer`.
- **Seed rule**: fixed seed kept only when `tries` is unset or 1; `tries > 1` always randomizes. Otherwise seed is random (max safe integer).
- Overrides locate nodes by `class_type` (`KSampler`, `EmptyLatentImage`, `SaveImage`); new bases must keep those node types.
- Images are fetched via `GET /view` only — never assumes server disk access.

### Job execution

- `queuePrompt(server, workflow)` → `promptId`
- `waitForCompletion(server, promptId)` → `historyEntry` (polls with configurable interval, configurable timeout)
- `saveOutputs({ server, destBaseDir, input, historyEntry })` → saved image metadata
- `convertOutputs(saved, { distBaseDir })` → converts to JPG
- `addToLog({ logPath, logEntries, job, saved, promptId, historyEntry })` → writes JSON log

### Output conventions

- Raw PNG: `output/<output-folder>/<prefix>_YYYYMMDDHHmmss.png` (`_<n>` for multi-image jobs)
- JPG: `dist/<output-folder>/<prefix>_YYYYMMDDHHmmss.jpg` (mirrors `output/` subfolders)
- Log: `output/logs/<input>_<run-ts>.json` (created empty upfront, appended live)
- Subfolder inputs keep their relative subfolder in logs

### Path safety

`resolveDestDir()` sanitizes `output-folder` values — path escape attempts are ignored with a warning and fall back to the base directory.

### Config

Server resolution (in `jobs/config.mjs`): `runpod/.active-pod.json` → `comfyUrl` (written by `start-pod`) wins over `COMFY_SERVER` from `.env`. One must be set. `COMFY_POLL_INTERVAL_MS` defaults to 5000, must be integer ≥ 1.

### Utilities

- `utils/naming.mjs` — timestamp formatting, prefix resolution, filename generation
- `utils/args.mjs` — CLI argument parsing for input name
- `utils/outputs.mjs` — collect output images from ComfyUI history
- `utils/paths.mjs` — safe path resolution with escape detection

### Testing

Unit tests mirror the source structure under `test/comfyui/workflow-builder/`. E2E golden-file tests cover the full YAML → workflow JSON pipeline (`test/comfyui/workflows/`, 30 test cases). Golden regeneration is a separate script — always regenerate, run the suite, and review diffs when workflow-builder logic changes. These are critical regression guards.
