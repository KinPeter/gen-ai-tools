# AGENTS.md

## Managed agentic delivery

Use `/deliver <inline requirement or path-to-requirements-file>` to run the
managed workflow: implementation, independent read-only review, then review
fixes. The orchestrator passes the exact review artifact path to the fixer and
finishes with QA evidence, a manual-testing request, and a suggested commit
message.

- Do not commit, reset, checkout, stash, or discard user changes.
- Every generated workflow artifact belongs under `.tmp/` and must include a
  unique UTC timestamp with seconds in its filename; never use a fixed review
  filename.
- OpenCode definitions live under `.opencode/`. `CLAUDE.md` points back to this file.

## Testing workflow

Use `/tests <scope or instruction>` to run the testing pipeline after
implementation: `test-writer` writes or updates tests, `test-reviewer` runs the
suite and writes a timestamped report under `.tmp/`, and `test-fixer` resolves
the report's test-side findings. All phases load the `testing-standards` skill
(`.opencode/skills/testing-standards/SKILL.md`). Testing phases never edit
production code; suspected implementation bugs are escalated to the user.
`vitest.config.mjs` is changed only when the user explicitly authorises it.

Node 24, ESM (`"type": "module"`, top-level await). Vitest (`vitest.config.mjs`, tests under `test/`); no typecheck or CI.

## Image helper agents (OpenCode)

OpenCode provides image helper agents for generating and validating ComfyUI batch
input YAML files for SDXL generation:

- **image-input-helper** — Primary agent, invoked via `/image-input`. Generates
  input YAML, coordinates validation and log lookups.
- **image-input-validator** (subagent) — Validates YAML against the batch job
  schema (`agent-tools/validate-input.mjs`).
- **image-log-finder** (subagent) — Looks up log entries for specific image files
  (`agent-tools/lookup-log.mjs`).
- **image-log-searcher** (subagent) — Searches historical logs with a two-phase
  approach (`agent-tools/log-search.mjs`).

## Setup

```sh
cp .env.example .env  # then fill in values
npm install
```

`dotenv` values are literal (no variable expansion). `package-lock.json` is tracked — commit updates alongside dependency changes.

## Repo layout

| Directory        | Purpose                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `comfyui/`       | ComfyUI inference — workflow building, job execution, output handling, log writing. |
| `runpod/`        | RunPod GPU pod lifecycle — create, wait, stop, terminate.                           |
| `logging/`       | MongoDB logging (new primary), DynamoDB (legacy), local scripts, browser UI build.  |
| `tools-hub/`     | Local Node HTTP server for static UIs and API routes                                |
| `dist-browser/`  | Vite + React browser UI for serving `dist/` outputs.                                |
| `test/`          | Vitest unit and E2E golden-file tests (mirrors source structure).                   |
| `shell-scripts/` | Bash helpers registered on the shell by `session.sh` (repo root).                   |
| `dist/`          | Generated JPG outputs (mirrors `output/` subfolders).                               |
| `output/`        | Raw PNG outputs + run logs. All gitignored.                                         |

Each module directory has its own `AGENTS.md` with detailed conventions. Scripts are defined in `package.json` — use `npm run <script>` to invoke them.

## Required QA

Every new development change must pass both checks before it is considered complete:

```sh
npm run lint
npm run format:check
```

Unless explicitly asked in your instructions, do not write or update tests
during implementation.

## Code quality rules

The repository's craft standards live in the `repo-standards` skill
(`.opencode/skills/repo-standards/SKILL.md`). Load it with the `skill` tool
before editing code; reviews are graded against it. Module-specific conventions
live in each module's `AGENTS.md`.
