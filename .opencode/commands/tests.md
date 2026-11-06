---
description: Run the testing pipeline for a scoped change
agent: test-orchestrator
---

Run the testing pipeline for this scope:

$ARGUMENTS

Derive the scope from this instruction first; fall back to the current git
status and diff only if it does not clearly name one. Ignore gitignored files.

Run the phases sequentially: `test-writer`, then `test-reviewer` writing a
timestamped report under `.tmp/`, then `test-fixer` reading that exact path.
Verify the suite and coverage yourself before reporting. Never edit production
code; escalate suspected implementation bugs to the user.
