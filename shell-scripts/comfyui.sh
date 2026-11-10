#!/usr/bin/env bash
# Source-only library — ComfyUI-related commands and shared batch logic.
# Loaded by session.sh via runpod.sh; shell-agnostic (bash 3.2+ and zsh).

# Repo root, resolved from this file's location (never the current directory).
# Functions must not do this themselves: in zsh, $0 inside a function is the
# function name, so the path is captured once at file scope. `cd`/`pwd -P` are
# builtins because `realpath` is not available on stock macOS.
_COMFYUI_DIR="$(dirname "${BASH_SOURCE[0]:-$0}")"
COMFY_ROOT="$(cd "${_COMFYUI_DIR}/.." && pwd -P)"

# Shared state for the batch loops, namespaced so they do not collide with the
# user's own shell variables. Declared at file scope because `local -g` does not
# exist in zsh (or in the bash 3.2 that ships with macOS); each command resets
# them before use.
GEN_AI_INTERRUPTED=0
GEN_AI_FAILED=()
GEN_AI_PREV_TRAPS=""

# Start a run: reset the shared state and install the interrupt trap,
# remembering any INT/TERM traps the user already had.
_begin_run() {
  GEN_AI_INTERRUPTED=0
  GEN_AI_FAILED=()
  GEN_AI_PREV_TRAPS="$(trap -p INT TERM 2>/dev/null || true)"
  trap 'GEN_AI_INTERRUPTED=1' INT TERM
}

# Put the previous INT/TERM traps back. zsh's `trap -p` prints nothing, so there
# the trap set by _begin_run is simply cleared.
_end_run() {
  if [[ -n "${GEN_AI_PREV_TRAPS:-}" ]]; then
    eval "${GEN_AI_PREV_TRAPS}"
  else
    trap - INT TERM
  fi
  GEN_AI_PREV_TRAPS=""
}

# Print the run summary and return the documented exit code:
# 130 when interrupted, 1 when inputs failed, otherwise the caller's own status.
_report_run_result() {
  local name="$1" rc="$2" interrupted_message="$3"
  if (( GEN_AI_INTERRUPTED )); then
    echo "$name: $interrupted_message" >&2
    return 130
  fi
  if (( ${#GEN_AI_FAILED[@]} > 0 )); then
    echo "$name: failed inputs: ${GEN_AI_FAILED[*]}" >&2
    return 1
  fi
  return "$rc"
}

# Run a single batch by input name (resolves from project root).
comfy-batch() { node "$COMFY_ROOT/comfyui/batch.mjs" "$@"; }

# Shared batch loop — called by both comfy() and runpod-comfy().
# Walks the comma-separated list token by token instead of using
# `IFS=',' read -ra` (zsh spells it `read -A`) or unquoted expansion splitting
# (zsh does not split on IFS).
_run_batches() {
  local inputs="$1" name
  while :; do
    name="${inputs%%,*}"
    name="${name//[[:space:]]/}"
    if [[ -n "$name" ]]; then
      if (( GEN_AI_INTERRUPTED )); then return 130; fi
      if ! comfy-batch "$name"; then
        GEN_AI_FAILED+=("$name")
        if (( GEN_AI_INTERRUPTED )); then return 1; fi
      fi
    fi
    if [[ "$inputs" == *,* ]]; then
      inputs="${inputs#*,}"
    else
      break
    fi
  done
  return 0
}

# Local batch loop: iterate over inputs, call comfy-batch for each.
# No pod management — just runs batches against whatever ComfyUI is already running.
# Usage: comfy -i <input1,input2,...>
comfy() {
  # Deprecation shim: forward 'comfy -p' to runpod-comfy.
  for arg in "$@"; do
    if [[ "$arg" == "-p" ]]; then
      echo "Warning: 'comfy -p' is deprecated; use 'runpod-comfy' instead." >&2
      runpod-comfy "$@"
      return
    fi
  done

  local inputs=""
  local OPTIND=1
  while getopts ":i:" opt; do
    case "$opt" in
      i) inputs="$OPTARG" ;;
      :) echo "comfy: option -$OPTARG requires an argument." >&2; return 2 ;;
      \?) echo "comfy: invalid option -$OPTARG." >&2; return 2 ;;
    esac
  done
  if [[ -z "${inputs//[[:space:],]/}" ]]; then
    echo "Usage: comfy -i <input1,input2,...>" >&2
    echo "  Runs batch for each input (no pod management)." >&2
    return 2
  fi

  _begin_run
  _run_batches "$inputs"
  # zsh makes `status` read-only (it is $?), so avoid that name.
  local rc=$?
  _end_run
  _report_run_result comfy "$rc" "interrupted; remaining inputs skipped."
}
