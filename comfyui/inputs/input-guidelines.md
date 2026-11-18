# Input Guidelines

Clear reference for writing `input.yaml` files — how blocks, prompts, and overrides map to ComfyUI workflow execution.

---

## File Structure

Top-level YAML list of **blocks**. Each block is a batch of jobs that share the same settings.

```yaml
# Each top-level `-` is a block
- base-workflow: example-base-workflow
  output-folder: rover-city
  prompts:
    - tries: 2
      prompt:
        - glossy, warm colors
        - 1girl, rover
```

**Mandatory at block level:**

- `base-workflow` — the base ComfyUI workflow to load (no default).
- `prompts` — list of prompt entries.

---

## Block-Level Overrides

Each block applies settings to all its prompts unless a prompt overrides them.
Values for all the optional overrides will use the values set in the base workflow.

| Property          | Type                 | Description                                                                   |
| ----------------- | -------------------- | ----------------------------------------------------------------------------- |
| `base-workflow`   | string               | Loads `comfyui/workflows/<name>.json` (`.json` optional). Required.           |
| `output-folder`   | string               | Output subdirectory under `output/`.                                          |
| `filename-prefix` | string               | Prefix for saved image filenames.                                             |
| `steps`           | finite number        | Diffusion steps override.                                                     |
| `cfg`             | finite number        | CFG scale.                                                                    |
| `sampler`         | string               | e.g., `euler`, `lcm`, `heun`, `dpmpp_2m`.                                     |
| `scheduler`       | string               | e.g., `normal`, `kl_optimal`, `karras`, `simple`.                             |
| `size`            | object               | `{width?: number, height?: number}` — output image dimensions.                |
| `seed`            | number or `"random"` | Fixed seed value or `"random"` for always-random. Defaults to random.         |
| `tries`           | int ≥ 1              | Number of workflow clones (retries/variants). Default: 1.                     |
| `loras`           | array                | List of `{name, strength}` — at least one entry required. LoRA chain entries. |
| `clip-skip`       | finite number        | CLIP layer stop point (0 is valid).                                           |

### Size Object

```yaml
size:
  width: 832
  height: 1216
```

Missing dimension keys inherit from the base workflow.

---

## Per-Prompt Overrides

Each prompt entry inherits block-level settings and can override:

- `tries` / `seed` — per-prompt clone count and seed behavior.
- `loras` — replaces **all** parent LoRAs entirely (no merging).
- `clip-skip` — per-prompt CLIP layer override.
- `prompt` / `negative-prompt` — replaces block-level entirely (appended to base CLIP text).

```yaml
- base-workflow: example-base-workflow
  loras:
    - name: nice-lora.safetensors
      strength: 1
  prompts:
    - # This prompt replaces block-level loras entirely
      loras:
        - name: second-lora.safetensors
          strength: 0.5
      prompt:
        - cyberpunk night scene
        - neon lights
      seed: 1683944602
```

---

## LoRA Chains

`loras` is a list of `{name, strength}` entries applied in order. The format is identical for every base workflow: the builder creates the LoRA chain in the background, so which loader the base uses internally never changes what you write.

**Definition:**

```yaml
loras:
  - name: one-shiny-lora.safetensors
    strength: 1.2
  - name: other-fancy-lora.safetensors
    strength: 0.8
```

- `name` — `.safetensors` file name (not full path).
- `strength` — LoRA strength; the builder applies it where it belongs for the chosen base.
- LoRAs chain sequentially: first LoRA loads, then the next, etc.

**Block vs. per-prompt:**

- Block-level `loras` are shared across all prompts.
- Per-prompt `loras` replace the parent's LoRAs entirely.

---

## Prompt Expansion

### Multi-line Prompts

Multi-line `prompt` entries are joined with commas:

```yaml
prompt:
  - glossy, warm colors
  - 1girl, rover
  - sitting, facing the viewer
```

They are represented in multi-lines only for easier human readability.
Empty/blank strings are filtered out before joining. The result is appended to the base workflow's positive CLIP text.

### Brace Syntax `{a, b}`

Brace syntax creates variants from a single text string:

```yaml
# Expands to 3 variants: one per hair color
- prompt:
    - shoulder-length {black, blonde, red} hair
```

- `{option1, option2}` → each option becomes a separate variant.
- Multiple brace groups → **cartesian product** (all combinations).
- **Non-recursive:** nested braces are flattened: `{b, {c, d}}` → `{b, c}` and `{b, d}`.
- **Single item with no comma** → braces stripped, content kept literal (e.g., `face tattoo:1.5`).

```yaml
# 3 × 3 = 9 combinations (hair color × makeup)
prompts:
  - prompt:
      - shoulder-length {black, blonde, red} hair
      - golden eyes, {red, blue, black} makeup
```

**Seed interaction:** if brace expansion produces more than one variant and the seed is fixed, the seed is removed so each variant gets a random seed. Use `seed: "random"` to be explicit.

---

## Seed and Tries

Seed behavior depends on the `seed` value and `tries` count:

| `seed`               | `tries` | Behavior                                      |
| -------------------- | ------- | --------------------------------------------- |
| _(unset)_            | 1       | Random seed (each call gets a different one). |
| _(unset)_            | >1      | Random seed per workflow clone.               |
| `1683944602` (fixed) | 1       | Fixed seed preserved.                         |
| `1683944602` (fixed) | >1      | Forced random — fixed seed discarded.         |
| `"random"`           | any     | Always random, regardless of `tries`.         |

---

## Base Workflow Resolution

| Input                                       | Resolves To                                    |
| ------------------------------------------- | ---------------------------------------------- |
| `base-workflow: example-base-workflow`      | `comfyui/workflows/example-base-workflow.json` |
| `base-workflow: example-base-workflow.json` | Same file (`.json` is optional).               |

- Same base file is **cached** and read once per session.
- Every block and every clone gets its own independent copy of the base workflow, so jobs never interfere.
- Bases come in two flavors — SDXL-style checkpoint bases and Krea2-style bases — and the input format is the same for both. The one exception: `clip-skip` is a checkpoint-base feature; Krea2-style models don't need it, and using it there returns an error.

### Available Base Workflows

The single source of truth is the `comfyui/workflows/` folder: list its files and ignore anything starting with `example-` — the non-example files are the production bases. Their filenames (without `.json`) go after `base-workflow:`.

---

## Processing Pipeline

```
input.yaml
    → parse + validate the YAML
    → merge block settings into each prompt entry
    → expand {a, b} brace variants
    → for each variant × tries: independent clone + overrides → one queued job
```

Each combination produces a distinct workflow JSON sent to the ComfyUI queue.

---

## Real Example

From `comfyui/inputs/input.example.yaml`:

```yaml
- base-workflow: example-base-workflow
  output-folder: rover-city
  filename-prefix: rover
  steps: 2
  cfg: 3.5
  size:
    width: 832
    height: 1216
  prompts:
    - tries: 2
      prompt:
        - glossy, warm colors
        - 1girl, rover, wuthering waves
        - shoulder-length {black, blonde, red} hair, black dress,
        - golden eyes, {red, blue, black} makeup
        - sitting, facing the viewer
        - smiling, pointing up
        - city, sunshine, realistic

    - seed: 1683944602
      prompt:
        - glossy, warm colors
        - 1girl, rover, wuthering waves
        - black hair, red dress, golden eyes
        - standing, facing the viewer
        - confident smile
        - city, night, neon lights
      negative-prompt:
        - insects, spiders
        - old houses
```

This block produces **two prompt groups** — the first with `tries: 2` (and brace expansion generating 9 variants), the second with a fixed seed and a negative prompt.

---

## Tips

- `base-workflow` is required — a block without it is rejected; omit the `.json` suffix for brevity.
- Use `seed: "random"` when you want predictable randomness regardless of `tries`.
- Use brace syntax `{a, b}` when varying **one aspect** across variants.
- Per-prompt `loras` fully replace block-level LoRAs — this is intentional for targeted chains.
