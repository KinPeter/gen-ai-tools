---
name: testing-standards
description: Repository Vitest standards — suite layout, isolation rules, coverage gate, and test quality bar
metadata:
  opencode/autoinvoke: false
---

# Testing Standards

The single source of testing truth for this repository. Every testing agent
loads this skill before working, and grades its work against it.

## Suite and framework

- Vitest on Node 24, ESM. Test files live under `test/` and match
  `test/**/*.test.{mjs,jsx,tsx}`.
- Commands: `npm run test` (`vitest run`), `npm run test:coverage`,
  `npm run test:watch`.
- `isolate: true` — each test file runs in its own module context.
- `test/support/setup.mjs` runs for every test file. It starts an MSW mock
  server with `onUnhandledRequest: "error"`, resets the handlers after every
  test, and calls `vi.restoreAllMocks()`.
- Reusable inputs live in `test/fixtures/`; module-specific fixtures sit beside
  the tests that use them.

## Structure

- Tests mirror the source folder and file structure by default.
- Deviating from the mirror is acceptable when it makes the test clearer, but
  state the deviation in the test file or your report.

## Isolation rules

These are hard requirements, not preferences.

- Unit and integration tests use mocks, stubs and spies for everything possible.
- Tests never use a real database connection.
- Tests never read, write, or delete repository files outside `test/`.
- Tests that need file operations create a temporary directory with
  `mkdtemp(path.join(os.tmpdir(), "<name>-"))` and remove it in teardown.
  Existing examples: `test/comfyui/jobs/output.test.mjs`,
  `test/runpod/coverage.test.mjs`, `test/comfyui/workflow-builder/workflow.test.mjs`.
- Golden-file tests under `test/comfyui/workflows/` are regenerated with
  `node test/comfyui/workflows/generate-goldens.mjs`, then the resulting diff is
  reviewed. Never hand-edit a golden file.

## Coverage gate

- `npm run test:coverage` enforces 90% line coverage per file
  (`thresholds: { perFile: true, lines: 90 }`).
- Coverage is measured only for `comfyui/`, `runpod/`, `logging/` and
  `tools-hub/`.
- Excluded from coverage: `**/node_modules/**`, `**/test/**`, `**/output/**`,
  `**/dist/**`, `**/.tmp/**`, `**/workflows/*.json`, `**/logging/temp-scripts/**`,
  `**/logging/log-cleanup.mjs`, `**/tools-hub/index.mjs`
- A file outside the include list carries no coverage expectation. Do not
  invent coverage for it.
- Coverage thresholds are never changed as part of a testing run.

## Quality bar

- Test behaviour and edge cases, not implementation details.
- Every new public function or branch introduced by a change has at least one
  test and at least one failure or edge case.
- Never weaken an assertion, delete a test, add `.skip` or `.only`, raise a
  threshold, or add a test that asserts nothing.
- Prefer the smallest test that proves the behaviour.

## Reading intent from the code

Testing agents are not given the original requirement. Infer intent from the
code under test: names, comments, docstrings, error handling, exported
contracts, and the surrounding module's documented behaviour in its `AGENTS.md`.

When the intent is unclear, or the code smells, report the smell with `file:line`
evidence as a suspicion. Do not state a verdict you cannot support, and do not
"fix" a smell by changing behaviour or assertions.
