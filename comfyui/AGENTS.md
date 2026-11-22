# ComfyUI Module

## Purpose

Batch image generation against a ComfyUI backend (local or a RunPod pod): build workflows from a YAML input, queue them, save the images, convert to JPG, log each generation to MongoDB.

## Entry points

- `batch.mjs` — `npm run comfy-batch -- <input-name>` (or `comfy-batch <input-name>` after `source ./session.sh`). Finds `<input-name>.yaml` by name anywhere under `<COMFY_ASSETS_PATH>/inputs`, runs every generated workflow sequentially, exits 1 if any job fails.
- `jobs/convert.mjs` — `npm run convert-all`: re-converts every PNG under `output/` into `dist/`.

## Architecture

`batch.mjs` is a thin orchestrator: resolve config → build jobs from YAML → per job (queue, wait, save, upload log, convert, delete PNG) → free GPU memory.

| File                | Role                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-builder/` | Input YAML + base workflow JSON → queueable workflow JSON                                                                       |
| `jobs/comfy.mjs`    | `POST /prompt`, poll `GET /history/{id}`, fetch images via `GET /view`, `POST /api/free`                                        |
| `jobs/save.mjs`     | Download images, write them to `output/`, delete PNG originals after conversion                                                 |
| `jobs/convert.mjs`  | PNG → JPG with Sharp (quality 90), mirrors `output/` subfolders into `dist/`                                                    |
| `jobs/log.mjs`      | Build log entries from the final workflow, upload them to MongoDB                                                               |
| `jobs/config.mjs`   | Server URL + poll interval + `COMFY_ASSETS_PATH` asset folders                                                                  |
| `utils/`            | CLI args, filename/timestamp helpers, history→image collection, safe path resolution, asset lookup by name, asset-base defaults |

### Workflow builder

Pipeline in `workflow-builder/workflow.mjs`: parse YAML → `validateJobData` → `expandPrompts` (merge block settings into each prompt entry) → `expandBraceVariants` → for each item × `tries`: `structuredClone(base)` → `applyOverrides`.

**Input YAML rules:**

- Top-level list of blocks; each block needs `base-workflow` and a non-empty `prompts` list. Per-prompt entries inherit the block's settings and override them (no merging — `prompt`, `negative-prompt`, `loras` are replaced wholesale).
- `base-workflow: <name>` loads `<COMFY_ASSETS_PATH>/workflows/<name>.json` (`.json` optional, found by name at any depth). Each base file is read once per run and cached.
- `prompt` / `negative-prompt` are lists of parts joined with `, ` and appended to the base CLIP text; blank parts are dropped.
- Brace variants: `{a, b}` inside a prompt string expands to one workflow per option; multiple groups → cartesian product. Nested braces are not parsed, single-option braces stay literal. A fixed `seed` is dropped when expansion yields more than one variant.
- `seed`: finite number or `"random"`. A fixed seed is only kept when `tries` is unset or `1`; `tries > 1` always randomizes. The base workflow's seed is never reused.
- `loras`: list of `{name, strength}` (≥ 1 entry) — creates `Lora_1..Lora_N` nodes chained after the base workflow's model loader: `LoraLoader` on a `CheckpointLoaderSimple` (`strength` applied to both `strength_model` and `strength_clip`) or `LoraLoaderModelOnly` on a `UNETLoader` (`strength_model` only, no `clip` link). Every node that referenced the loader moves to the last LoRA — model output always, CLIP output only on a checkpoint, VAE never — so a `ModelSamplingAuraFlow` shift node is rewired too and the sampler keeps reading it. Requires a `CheckpointLoaderSimple` or `UNETLoader` node.
- `clip-skip`: overrides `stop_at_clip_layer` on an existing `CLIPSetLastLayer`, otherwise creates a `ClipSkip_Base` node after the model loader and rewires both CLIP text nodes to it. Applied after LoRAs, so the clip source is the last LoRA when LoRAs are present. Creating the node needs a `CheckpointLoaderSimple` (the CLIP output comes from the checkpoint), so `clip-skip` on a `UNETLoader` base fails with an error instead of dangling the CLIP nodes.
- `tries`: integer ≥ 1, default 1 — each try is a separate queued workflow.
- `size` (`{width, height}`), `steps`, `cfg`, `sampler`, `scheduler`, `filename-prefix`, `output-folder` are optional; omitted values keep the base workflow's.
- Nodes are located by `class_type` (`KSampler`, `EmptyLatentImage`, `SaveImage`, plus the base's model loader — `CheckpointLoaderSimple` or `UNETLoader`, found by `findModelLoader` in table order); positive/negative CLIP nodes are resolved from the sampler's `positive`/`negative` links, falling back to `PositiveCLIP_Base` / `NegativeCLIP_Base`. New base workflows must keep those node types.
- Checkpoint-free base workflows are supported (`example-unet-base-workflow`: `UNETLoader` + `CLIPLoader` + `VAELoader`). `loras` works on them as `LoraLoaderModelOnly` nodes; `clip-skip` still requires a `CheckpointLoaderSimple` and fails loudly on a UNETLoader base.
- Images are always fetched through `GET /view` — the code never assumes access to the ComfyUI server's disk.

### Job execution

- `queuePrompt(server, workflow)` → `promptId`
- `waitForCompletion(server, promptId, { pollIntervalMs, timeoutMs })` → `historyEntry` (default 5 s poll, 15 min timeout)
- `fetchImage(server, { filename, subfolder, type })` → `Buffer`
- `saveOutputs({ server, destBaseDir, shouldKeepOriginals, input, historyEntry })` → `[{ filename, destDir }]`
- `addToLog({ logPath, logEntries, job, saved, promptId, historyEntry, dbConnection })` → uploads entries to MongoDB (local JSON writing is disabled)
- `convertOutputs(saved, { outputBaseDir, distBaseDir })` → JPGs
- `cleanupOriginals(saved)` → deletes the saved PNGs and any directory left empty
- `freeMemory(server, { freeMemory, unloadModels })` / `requestMemoryCleanup(server)` — the latter is called once at the end of a run and is non-fatal

### Output conventions

- Raw image: `output/<output-folder>/<prefix>_YYYYMMDDHHmmss.<ext>` (`_<n>` for multi-image jobs); the extension comes from the ComfyUI filename
- JPG: `dist/<output-folder>/<prefix>_YYYYMMDDHHmmss.jpg` (mirrors `output/` subfolders)
- PNG originals are deleted after conversion unless `COMFY_KEEP_ORIGINALS=true`
- Log entry per image, keyed in MongoDB by the extension-stripped filename: input settings plus `model` (the `ckpt_name` of the checkpoint, or the `unet_name` of a `UNETLoader` base workflow), `prompt`, `negative-prompt`, `steps`, `cfg`, `sampler`, `scheduler`, `seed`, `filename`, `generatedIn` (`m:ss`, from the `execution_start`/`execution_success` status messages), `comfyJobId`
- `output/logs/<input>_<run-ts>.json` is still created empty at the start of a run (subfolder inputs keep their relative subfolder)

### Path safety

`utils/paths.mjs` → `resolveDestDir()` sanitizes `output-folder`: values that escape the base directory are ignored with a warning and fall back to the base. The `utils/assets.mjs` file exports `findAssetPath(baseDir, name)`: the exact `<baseDir>/<name>` join is tried first (so `sub/<name>` means that file), then `baseDir` is searched breadth-first by file name — symlinked files are matched, symlinked folders and `node_modules`/`.git` are skipped, so the walk cannot cycle. It errors when nothing matches or the name matches twice, and when the name escapes `baseDir`; inputs and base workflows are located through it, so their depth under the asset folders is free and a file name has to be unique per tree. `utils/assets.mjs` owns the asset base: `resolveAssetPaths(env)` reads `COMFY_ASSETS_PATH` (must be absolute when set) and exports `REPO_ASSET_DIRS` for the `comfyui/` fallback.

### Config

`jobs/config.mjs`: `runpod/.active-pod.json` → `comfyUrl` (written by `start-pod`) wins over `COMFY_SERVER` from `.env`; neither set → exit 1. `COMFY_POLL_INTERVAL_MS` defaults to 5000 and must be an integer ≥ 1. `COMFY_ASSETS_PATH` names the asset base the batch reads from — absolute when set, `comfyui/` in this repo when unset or blank; `loadConfig()` reports `assetsPath`, `inputsDir` (`<assets>/inputs`) and `workflowsDir` (`<assets>/workflows`), and `utils/assets.mjs` is the single owner of that base. Logging needs `MONGODB_URI` (`logging/mongodb/client.mjs`).

### Testing

Unit tests mirror the source under `test/comfyui/` (`workflow-builder/`, `jobs/`, `utils/`, `cli/`). E2E golden-file tests cover the full YAML → workflow JSON pipeline (`test/comfyui/workflows/`, 40 input/golden pairs; fixture bases include checkpoint-free `unet-base` / `unet-with-lora` / `unet-with-shift` mirrors of the `example-unet-*` workflows); `generate-goldens.mjs` regenerates them with deterministic seeds and formats its output with Prettier, so regenerated goldens land in committed form. The goldens store node and input key order — after a workflow-builder change, regenerate, run the suite, and review the golden diffs; that diff is the key-order gate. Every `comfyui/**/*.mjs` must pass the 90% per-file line coverage threshold.
