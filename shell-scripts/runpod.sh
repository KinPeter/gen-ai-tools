#!/usr/bin/env bash
# Source-only library — RunPod pod lifecycle.
# Sources runpod-comfy.sh so all commands are registered together.
# Shell-agnostic (bash 3.2+ and zsh): zsh has no BASH_SOURCE, but $0 is the
# sourced file.
source "$(dirname "${BASH_SOURCE[0]:-$0}")/runpod-comfy.sh"

start-pod() { npm run start-pod -- "$@"; }
stop-pod()  { npm run stop-pod; }
