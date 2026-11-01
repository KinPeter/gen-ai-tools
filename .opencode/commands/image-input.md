---
description: Generate and validate ComfyUI batch input YAML files for SDXL image generation
agent: image-input-helper
---

Ask the image-input-helper to generate input YAML files for ComfyUI batch image generation.

$ARGUMENTS

The agent will:

- Follow the input guidelines in `comfyui/inputs/input-guidelines.md`.
- Place generated YAML files under `comfyui/inputs/` with short, kebab-case names.
- Validate each file using the `image-input-validator` subagent before presenting.
- Look up existing image logs via `image-log-finder` or search historical logs via `image-log-searcher` when relevant.
- Default to SDXL-appropriate settings unless you specify otherwise.

Common patterns:

- Single prompt with multiple settings variations
- Multiple prompts sharing the same settings
- Both combined (multiple prompts × multiple tries)
- LoRA chain configurations
- Brace syntax for quick variant generation
