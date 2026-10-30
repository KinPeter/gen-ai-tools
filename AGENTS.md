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
- OpenCode definitions live under `.opencode/`; Claude Code mirrors live under
  `.claude/`. Keep both trees synchronized whenever agents, skills, commands,
  or workflow behavior changes. `CLAUDE.md` points back to this file.

Node 24, ESM (`"type": "module"`, top-level await). Vitest (`vitest.config.mjs`, tests under `test/`); no typecheck or CI.

## Setup

```sh
cp .env.example .env  # then fill in values
npm install
```

`dotenv` values are literal (no variable expansion). `package-lock.json` is tracked — commit updates alongside dependency changes.

## Repo layout

| Directory            | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `comfyui/`           | ComfyUI inference — workflow building, job execution, output handling, log writing. |
| `runpod/`            | RunPod GPU pod lifecycle — create, wait, stop, terminate.                           |
| `logging/`           | DynamoDB logging helpers, Lambda deployment, browser UI build, FTP upload.          |
| `dist-browser/`      | Vite + React browser UI for serving `dist/` outputs.                                |
| `test/`              | Vitest unit and E2E golden-file tests (mirrors source structure).                   |
| `comfyui/workflows/` | Base workflow JSON templates (used by the workflow builder).                        |
| `comfyui/inputs/`    | Input YAML definitions (prompt sets, LoRA chains, seeds).                           |
| `dist/`              | Generated JPG outputs (mirrors `output/` subfolders).                               |
| `output/`            | Raw PNG outputs + run logs. All gitignored.                                         |

Each module directory has its own `AGENTS.md` with detailed conventions. Scripts are defined in `package.json` — use `npm run <script>` to invoke them.

## Required QA

Every new development change must pass both checks before it is considered complete:

```sh
npm run lint
npm run format:check
```

Coverage gate: `npm run test:coverage` applies the 90% per-file line threshold to
`comfyui/`, `runpod/` and `logging/` only. `dist-browser/**` is unit-tested
(`test/dist-browser/`, jsdom + `@testing-library/react`) but is deliberately not
measured by that threshold.

## Code quality rules

Every change and every review must uphold these principles. They apply to all
code in the repo — Node.js modules and React components alike.

### Single responsibility & separation of concerns

- **Each file has one job.** If a file contains logic for two different
  responsibilities, extract the second into its own file.
- **Each function does one thing.** A function that clearly performs multiple
  distinct steps (e.g. read + transform + write) must be split into separate
  functions.
- **Pure logic is separated from I/O.** File reads, network calls, and console
  output live at the module boundary. Transform and business logic live in
  pure functions (no side effects). This makes them testable and reusable.
- **Constants and config live together.** Extract magic values and repeated
  strings into named constants at or near the top of the file. Never scatter
  literal values throughout logic.

### Manageable size

- **Files:** aim for ≤ 100 lines; ≤ 150 is acceptable for thin orchestrators
  that compose smaller functions. Anything over 200 lines **must** be split.
- **Functions:** aim for ≤ 25 lines; ≤ 35 is acceptable for naturally long
  sequences (e.g. API request handling). Functions over 40 lines are a clear
  signal to extract.
- **Components:** a React component that handles more than one visual concern
  (e.g. rendering a list AND editing an item) should be split into a list
  component and an edit/detail component.

### DRY — extract early

- **Extract named functions even for one-time use.** If a block of code could
  be described with a verb phrase (e.g. "validate pod state"), it belongs in a
  named function. Anonymous inner functions for complex logic are a smell.
- **Extract repeated patterns, not just repeated code.** If two functions
  perform the same logical step with different inputs, abstract the pattern
  into a shared helper.
- **Prefer extraction over inlining.** A named function with a clear name is
  more readable than an inlined block, even if used only once.

### Review checklist

Reviewers must verify:

- No function exceeds ~35 lines (with documented justification if it does).
- No file exceeds ~150 lines (with documented justification if it does).
- I/O (file, network, console) is kept at the edges; pure logic is in
  testable functions.
- Magic values and repeated strings are extracted into named constants.
- Any new complex logic block has been given a descriptive function name.
