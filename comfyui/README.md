# ComfyUI batch generation

Describe prompts in a YAML file, run one command, and get images in `output/`/`dist/` plus a log entry per image in MongoDB. Works against a local ComfyUI or a RunPod pod.

## Run

```sh
npm run comfy-batch -- <input-name>     # reads comfyui/inputs/<input-name>.yaml
npm run convert-all                     # re-convert every PNG in output/ to dist/
```

Subfolder inputs work: `comfy-batch archive/<name>`. The input path is resolved from the project root, not the current directory.

Pod lifecycle helpers (`start-pod`, `stop-pod`) are in [runpod/](../runpod/README.md); the batch only reads the pod's ComfyUI URL from its state file.

## What one run does

1. Resolve the ComfyUI server: active pod state (`runpod/.active-pod.json`, written by `start-pod`) first, else `COMFY_SERVER`.
2. Parse the input YAML into one workflow per prompt × `tries` (brace variants multiply the count).
3. Queue each workflow (`POST /prompt`), poll `/history/{id}` until success, download the images via `/view`.
4. Save PNGs under `output/<output-folder>/`, convert to JPG in `dist/` (mirroring subfolders), then delete the PNGs unless `COMFY_KEEP_ORIGINALS=true`.
5. Upload a log entry per image to MongoDB (`gen-ai.image-logs`, keyed by the filename without extension).
6. Free GPU memory (`POST /api/free`) at the end.

## Input YAML

A list of blocks; each block shares its settings across a `prompts` list, and per-prompt entries override the block.

```yaml
- base-workflow: juggernaut # comfyui/workflows/<name>.json, required
  output-folder: rover-city # subfolder of output/
  filename-prefix: rover
  steps: 20
  cfg: 3.5
  size: { width: 832, height: 1216 }
  loras: # Lora_1..Lora_N chain after the checkpoint
    - name: nice-lora.safetensors
      strength: 1
  clip-skip: -2
  prompts:
    - tries: 4 # forces random seeds
      prompt:
        - glossy, soft light
        - woman, {black, blonde, red} hair # one workflow per option
      negative-prompt:
        - blurry, lowres
    - seed: 12345
      prompt:
        - vintage, broken clouds
```

- `base-workflow`, `prompts` — required. Everything else is optional and falls back to the base workflow's values.
- `prompt` / `negative-prompt` parts are joined with `, ` and appended to the base CLIP text.
- `{a, b}` expands to one workflow per option; multiple groups give the cartesian product. A fixed `seed` is dropped when expansion yields more than one variant.
- `seed`: number (kept only when `tries` is unset or 1), `"random"`, or omitted (= random).
- `tries`: integer ≥ 1, default 1 — each try is a separate queued job.
- `loras`: at least one `{name, strength}`; per-prompt `loras` replace the block's entirely.
- `clip-skip`: overrides `stop_at_clip_layer`, creating a `CLIPSetLastLayer` node if the base has none.

Full details: [input guidelines](./inputs/input-guidelines.md) and [example input](./inputs/input.example.yaml). Base workflow JSONs live in `workflows/` (real ones: `juggernaut`, `lustify`, `pmaster`, `sotros`, `unholy`; the `example-*` files are test templates).

## Outputs

| Path                                          | Contents                                      |
| --------------------------------------------- | --------------------------------------------- |
| `output/<folder>/<prefix>_YYYYMMDDHHmmss.png` | raw image (`_<n>` for multi-image jobs)       |
| `dist/<folder>/<prefix>_YYYYMMDDHHmmss.jpg`   | converted copy, mirrors `output/` subfolders  |
| `output/logs/<input>_<run-ts>.json`           | created empty per run (entries go to MongoDB) |

## Environment (`.env`)

| Variable                 | Required                    | Description                                    |
| ------------------------ | --------------------------- | ---------------------------------------------- |
| `COMFY_SERVER`           | yes, unless a pod is active | ComfyUI base URL, e.g. `http://127.0.0.1:8188` |
| `COMFY_POLL_INTERVAL_MS` | no (default `5000`)         | History poll interval while waiting            |
| `COMFY_KEEP_ORIGINALS`   | no (default `false`)        | Keep the PNG originals after conversion        |
| `MONGODB_URI`            | yes for logging             | MongoDB connection for log uploads             |

## Tests

```sh
npm run test              # unit + golden-file e2e
npm run test:coverage     # 90% per-file line coverage required
```

Golden files under `test/comfyui/workflows/golden/` are regenerated with `node test/comfyui/workflows/generate-goldens.mjs` when the workflow builder changes.
