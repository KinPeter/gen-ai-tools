---
name: repo-standards
description: Repository code-quality standards — single responsibility, size limits, DRY extraction, and the reviewer checklist
---

# Repo Standards

These principles apply to every change and every review, to Node.js modules and
React components alike, and to files under `test/`. They govern code you add or
materially change in a task; a pre-existing file that already exceeds a limit is
not a finding unless the change makes it worse. Module `AGENTS.md` files describe
what lives where and do not override these principles — if one appears to
conflict, report the conflict instead of quietly choosing a side. Testing-specific
rules live in the `testing-standards` skill.

## Single responsibility & separation of concerns

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

## Manageable size

- **Files:** aim for ≤ 100 lines; ≤ 150 is acceptable for thin orchestrators
  that compose smaller functions. Anything over 200 lines **must** be split.
- **Functions:** aim for ≤ 25 lines; ≤ 35 is acceptable for naturally long
  sequences (e.g. API request handling). Functions over 40 lines are a clear
  signal to extract.
- **Components:** a React component that handles more than one visual concern
  (e.g. rendering a list AND editing an item) should be split into a list
  component and an edit/detail component.

## DRY — extract early

- **Extract named functions even for one-time use.** If a block of code could
  be described with a verb phrase (e.g. "validate pod state"), it belongs in a
  named function. Anonymous inner functions for complex logic are a smell.
- **Extract repeated patterns, not just repeated code.** If two functions
  perform the same logical step with different inputs, abstract the pattern
  into a shared helper.
- **Prefer extraction over inlining.** A named function with a clear name is
  more readable than an inlined block, even if used only once.
- **Put extracted helpers in the right file.** A helper or utility that is
  generic enough to be reused belongs in a `utils`-style file (for example
  `comfyui/utils/`, `tools-hub/utils/`), not in the file it was pulled from.
  Keep it next to the feature only when it is tightly coupled to that feature.
  Ask: would another module want to call this? If yes, it is not local.

## Review checklist

Reviewers must verify, for code added or materially changed in the task:

- No file exceeds 150 lines without a stated justification; anything over 200
  lines must be split.
- No function exceeds 35 lines without a stated justification; anything over 40
  lines signals extraction.
- Each file has one job, and each function does one thing.
- I/O (file, network, console) is kept at the edges; pure logic is in testable
  functions.
- Magic values and repeated strings are extracted into named constants.
- Any new complex logic block has been given a descriptive function name.
- Repeated logical steps are abstracted into a shared helper rather than
  duplicated.
- Extracted helpers live in the right place: generic helpers in a
  `utils`-style file, feature-coupled helpers beside the feature they support.
- A React component handles one visual concern; split list and edit/detail
  rendering into separate components.

## Temporary files

IMPORTANT: Write your temporary files, probes, debug scripts and anything that is
not intended to be part of the final code under the `.tmp/` folder in the repo!
