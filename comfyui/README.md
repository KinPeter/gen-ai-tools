# ComfyUI batch generation

Describe prompts in a YAML file, run one command, and get images in `output/`/`dist/` plus a log entry per image in MongoDB. Works against a local ComfyUI or a RunPod pod.

## Run

```sh
npm run comfy-batch -- <input-name>     # finds <input-name>.yaml under COMFY_ASSETS_PATH/inputs
npm run convert-all                     # re-convert every PNG in output/ to dist/
```

Assets come from `COMFY_ASSETS_PATH` — inputs from its `inputs/` folder, base workflow JSONs from its `workflows/` folder. The variable must be an absolute path; unset or blank, both trees fall back to `comfyui/inputs/` and `comfyui/workflows/` in this repo, so the lookup never depends on the current directory. A name is tried as an exact path first (`comfy-batch archive/new-images`), otherwise it is found by file name at any depth (`comfy-batch new-images` finds `inputs/whatever/new-images.yaml`, `base-workflow: krea2` finds `workflows/new/krea2/krea2.json`); `node_modules/` and `.git/` are skipped, so point the variable at a dedicated assets folder rather than a whole ComfyUI installation. File names must be unique inside each tree — a duplicate is reported as ambiguous. Extensions are optional both ways, so `comfy-batch new-images.yaml` works too.

Pod lifecycle helpers (`start-pod`, `stop-pod`) are in [runpod/](../runpod/README.md); the batch only reads the pod's ComfyUI URL from its state file.

## What one run does

1. Resolve the ComfyUI server (active pod state `runpod/.active-pod.json`, written by `start-pod`, first, else `COMFY_SERVER`) and the asset base `COMFY_ASSETS_PATH`.
2. Parse the input YAML into one workflow per prompt × `tries` (brace variants multiply the count).
3. Queue each workflow (`POST /prompt`), poll `/history/{id}` until success, download the images via `/view`.
4. Save PNGs under `output/<output-folder>/`, convert to JPG in the dist folder (`COMFY_DIST_PATH`, default repo-root `dist/`; mirrors subfolders), then delete the PNGs unless `COMFY_KEEP_ORIGINALS=true`.
5. Upload a log entry per image to MongoDB (`gen-ai.image-logs`, keyed by the filename without extension).
6. Free GPU memory (`POST /api/free`) at the end.

## Input YAML

A list of blocks; each block shares its settings across a `prompts` list, and per-prompt entries override the block.

```yaml
- base-workflow: juggernaut # <COMFY_ASSETS_PATH>/workflows/juggernaut.json, required
  output-folder: rover-city # subfolder of output/
  filename-prefix: rover
  steps: 20
  cfg: 3.5
  size: { width: 832, height: 1216 }
  loras: # Lora_1..Lora_N chain after the base's model loader
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

- base-workflow: img2img-workflow # a base with one LoadImage → VAEEncode_Reference → ReferenceLatent chain
  inputs: # reference images, in YAML order — bare names in the server's input/ folder
    - first-reference.jpg
    - second-reference.jpg
  prompts:
    - prompt:
        - the two people from Figure 1 and Figure 2 posing together
```

- `base-workflow`, `prompts` — required. Everything else is optional and falls back to the base workflow's values.
- `prompt` / `negative-prompt` parts are joined with `, ` and appended to the base CLIP text.
- `{a, b}` expands to one workflow per option; multiple groups give the cartesian product. A fixed `seed` is dropped when expansion yields more than one variant.
- `seed`: number (kept only when `tries` is unset or 1), `"random"`, or omitted (= random).
- `tries`: integer ≥ 1, default 1 — each try is a separate queued job.
- `loras`: at least one `{name, strength}`; per-prompt `loras` replace the block's entirely. Works on both loaders: `LoraLoader` after a `CheckpointLoaderSimple` (`strength` also sets `strength_clip`) or `LoraLoaderModelOnly` after a `UNETLoader` such as `example-unet-base-workflow` (`strength_model` only).
- `clip-skip`: overrides `stop_at_clip_layer`, creating a `CLIPSetLastLayer` node if the base has none; needs a `CheckpointLoaderSimple`, so it errors on a `UNETLoader` base.
- `inputs`: the reference images of an img2img base, applied in YAML order. The first name replaces the filename on the base chain's `LoadImage`; each extra name appends its own `LoadImage_N` → `ImageScaleToTotalPixels_N` → `VAEEncode_Reference_N` → `ReferenceLatent_Positive_N` / `ReferenceLatent_Negative_N` chain — the scaling settings and the VAE link are copied from the base chain, image N conditions from image N-1, and the `KSampler`'s `positive` / `negative` move onto the last pair. Names are bare file names with an extension: no folder, no URL, and the image must already sit in the ComfyUI server's `input/` folder — the batch never uploads it and `COMFY_ASSETS_PATH` is never searched. Needs a base that carries exactly one `LoadImage` → `ImageScaleToTotalPixels` → `VAEEncode_Reference` → `ReferenceLatent` chain, unlabeled or numbered `_1`; a base without one errors (`comfyui/workflows/example-img2img-workflow.json` shows the two-image result graph, it is not a base to point `base-workflow` at). A per-prompt `inputs` replaces the block's list, but only the block's is validated, so keep the list on the block.

Full details: `input-guidelines.md` in the asset base (`<COMFY_ASSETS_PATH>/docs/`, not in this repo) and [example input](./inputs/input.example.yaml). Base workflow JSONs live under `<COMFY_ASSETS_PATH>/workflows/`.

## Outputs

| Path                                          | Contents                                      |
| --------------------------------------------- | --------------------------------------------- |
| `output/<folder>/<prefix>_YYYYMMDDHHmmss.png` | raw image (`_<n>` for multi-image jobs)       |
| `dist/<folder>/<prefix>_YYYYMMDDHHmmss.jpg`   | converted copy, mirrors `output/` subfolders  |
| `output/logs/<input>_<run-ts>.json`           | created empty per run (entries go to MongoDB) |

## Environment (`.env`)

| Variable                 | Required                    | Description                                                                             |
| ------------------------ | --------------------------- | --------------------------------------------------------------------------------------- |
| `COMFY_SERVER`           | yes, unless a pod is active | ComfyUI base URL, e.g. `http://127.0.0.1:8188`                                          |
| `COMFY_ASSETS_PATH`      | no (default `comfyui/`)     | Absolute asset base: its `inputs/` and `workflows/` trees are read by name at any depth |
| `COMFY_POLL_INTERVAL_MS` | no (default `5000`)         | History poll interval while waiting                                                     |
| `COMFY_KEEP_ORIGINALS`   | no (default `false`)        | Keep the PNG originals after conversion                                                 |
| `MONGODB_URI`            | yes for logging             | MongoDB connection for log uploads                                                      |

## Tests

```sh
npm run test              # unit + golden-file e2e
npm run test:coverage     # 90% per-file line coverage required
```

Golden files under `test/comfyui/workflows/golden/` are regenerated with `node test/comfyui/workflows/generate-goldens.mjs` when the workflow builder changes.
