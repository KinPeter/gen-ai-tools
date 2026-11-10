# Shell Scripts Module

## Purpose

Convenience commands for the local workflow, registered on the current shell session. No npm scripts, no global installs.

## Entry point

`session.sh` at the repo root is the only file the user sources. It refuses to run as a script (`bash session.sh`) and then loads the chain:

`session.sh → runpod.sh → runpod-comfy.sh → comfyui.sh → tools-hub.sh`

This sourcing order puts the leaf commands (`comfy-batch`, `comfy`) in scope before the wrapper (`runpod-comfy`) that calls it.

## Files

| File                | Registers               | Notes                                                                                                                                                             |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comfyui.sh`        | `comfy-batch`, `comfy`  | Owns the helpers shared by both batch commands: `_run_batches`, `_begin_run`, `_end_run`, `_report_run_result`.                                                   |
| `runpod.sh`         | `start-pod`, `stop-pod` | Wrappers over `npm run start-pod` / `npm run stop-pod`.                                                                                                           |
| `runpod-comfy.sh`   | `runpod-comfy`          | Pod lifecycle around the shared batch loop.                                                                                                                       |
| `tools-hub.sh`      | `thub`                  | `thub start/status/stop/restart` for the local tools-hub server. Sourced helpers live alongside it.                                                               |
| `tools-hub-port.sh` | (helpers)               | Port probes sourced by `tools-hub.sh`: `_thub_port`, `_thub_listen_tool`, `_thub_port_pid`, `_thub_is_listening`, `_thub_wait_for_listen`, `_thub_wait_for_free`. |

## Conventions

- Plain shell functions (bash 3.2+ and zsh), no npm scripts. Wrappers delegate to `npm run <script>` or `node <path>`.
- The `#!/usr/bin/env bash` shebangs are harmless, but these files are source-only libraries; only `session.sh` is meant to be run.
- Project paths are resolved from `${BASH_SOURCE[0]:-$0}` at file scope, never from the current working directory. zsh has no `BASH_SOURCE`, but `$0` is the sourced file; inside a zsh function `$0` is the function name, so paths must be captured at file scope, not inside functions. The repo root is resolved with `cd … && pwd -P` rather than `realpath`, which stock macOS does not ship.
- `GEN_AI_INTERRUPTED` and `GEN_AI_FAILED` are namespaced module-level globals declared in `comfyui.sh` (`local -g` does not exist in zsh or in the bash 3.2 macOS ships); `_begin_run` resets them and installs the `INT`/`TERM` trap, `_end_run` restores the traps the user had before (zsh's `trap -p` prints nothing, so there the trap is just cleared), and `_run_batches` reads them. `_report_run_result` prints the summary and returns the exit code.
- `_run_batches` walks the comma-separated list token by token rather than using `IFS=',' read -ra`, because zsh spells the flag `read -A` (uppercase) and does not split unquoted expansions on `IFS`.
- Port detection uses the first tool available in `_thub_listen_tool`: `lsof`, then `ss` (Linux), then `nc`. macOS has no `ss`. `nc` is used only by `_thub_is_listening` — it can tell whether a port is open but not which PID owns it — and both helpers return 1 when none of the three tools exist. `tools-hub.sh` resolves `THUB_ROOT`/`THUB_PORT_DEFAULT` at file scope and sources `tools-hub-port.sh`, which reads those constants.
- `thub stop` and `thub restart` only touch the PID recorded in `.tmp/tools-hub.pid`; a process holding the port that thub did not start is reported and left alone, mirroring `thub status`. `thub restart` aborts if the port is still bound after the stop.
- Exit codes: `2` usage error, `1` one or more failed inputs, `130` interrupted, otherwise the status of the last underlying command.
- `runpod-comfy` calls `stop-pod` on every path, including a failed `start-pod` or Ctrl+C, so a pod never keeps billing.
- `comfy -p` is a deprecation shim that forwards the arguments unchanged to `runpod-comfy`.

## Changing these files

Edits are picked up by re-sourcing `session.sh` in the current shell. Keep new commands in the file matching their domain, and add them to the `Registered:` block in `session.sh`.
