# Shell Scripts Module

## Purpose

Convenience commands for the local workflow, registered on the current shell session. No npm scripts, no global installs.

## Entry point

`session.sh` at the repo root is the only file the user sources. It refuses to run as a script (`bash session.sh`) and then loads the chain:

`session.sh → runpod.sh → runpod-comfy.sh → comfyui.sh`

This sourcing order puts the leaf commands (`comfy-batch`, `comfy`) in scope before the wrapper (`runpod-comfy`) that calls them.

## Files

| File              | Registers                              | Notes                                                          |
| ----------------- | -------------------------------------- | -------------------------------------------------------------- |
| `comfyui.sh`      | `comfy-batch`, `comfy`, `_run_batches` | `_run_batches` is the shared loop used by both batch commands. |
| `runpod.sh`       | `start-pod`, `stop-pod`                | Wrappers over `npm run start-pod` / `npm run stop-pod`.        |
| `runpod-comfy.sh` | `runpod-comfy`                         | Pod lifecycle around the shared batch loop.                    |

## Conventions

- Plain bash functions, no npm scripts. Wrappers delegate to `npm run <script>` or `node <path>`.
- Project paths are resolved from `BASH_SOURCE`, never from the current working directory.
- `interrupted` and `failed` are `local -g` in the caller and read by `_run_batches`; every command traps `INT`/`TERM` and clears the trap on exit.
- Exit codes: `2` usage error, `1` one or more failed inputs, `130` interrupted, otherwise the status of the last underlying command.
- `runpod-comfy` calls `stop-pod` on every path, including a failed `start-pod` or Ctrl+C, so a pod never keeps billing.
- `comfy -p` is a deprecation shim that forwards to `runpod-comfy`.

## Changing these files

Edits are picked up by re-sourcing `session.sh` in the current shell. Keep new commands in the file matching their domain, and add them to the `Registered:` line in `session.sh`.
