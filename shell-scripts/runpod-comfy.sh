#!/usr/bin/env bash
# Source-only library — full managed workflow (pod + batch loop).
# Depends on: start-pod, stop-pod, comfy-batch, _run_batches (all from the sourcing chain).
# Shell-agnostic (bash 3.2+ and zsh).
source "$(dirname "${BASH_SOURCE[0]:-$0}")/comfyui.sh"

# Full run: start a pod, batch each input, always stop the pod.
# Usage: runpod-comfy [-p <image-key>] -i <input1,input2,...>
#   Failed inputs don't stop the remaining ones, but the exit code
#   is non-zero if anything failed. stop-pod runs in every case
#   (batch failure, start-pod failure, Ctrl+C) so a pod never
#   keeps billing unattended.
runpod-comfy() {
  local opt pod_image="" inputs=""
  local OPTIND=1
  while getopts ":p:i:" opt; do
    case "$opt" in
      p) pod_image="$OPTARG" ;;
      i) inputs="$OPTARG" ;;
      :) echo "runpod-comfy: option -$OPTARG requires an argument." >&2; return 2 ;;
      \?) echo "runpod-comfy: invalid option -$OPTARG." >&2; return 2 ;;
    esac
  done
  if [[ -z "${inputs//[[:space:],]/}" ]]; then
    echo "Usage: runpod-comfy [-p <image-key>] -i <input1,input2,...>" >&2
    echo "  Starts a pod, runs batch for each input, always stops the pod." >&2
    return 2
  fi

  _begin_run

  if [[ -n "$pod_image" ]]; then start-pod "$pod_image"; else start-pod; fi
  # zsh makes `status` read-only (it is $?), so avoid that name.
  local rc=$?
  if (( rc != 0 )); then
    _end_run
    stop-pod # start-pod can fail after creating the pod; never leave it billing
    return "$rc"
  fi

  _run_batches "$inputs"
  _end_run
  stop-pod
  local stop_rc=$?
  _report_run_result runpod-comfy "$stop_rc" "interrupted; pod stopped."
}
