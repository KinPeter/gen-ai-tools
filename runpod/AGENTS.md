# RunPod Module

## Purpose

Manage RunPod GPU pod lifecycle for ComfyUI inference — create, wait, work, stop, terminate.

## Architecture

Single linear lifecycle — never restart or reuse pods:

**create → wait RUNNING → work → stop-pod (stop → wait EXITED → terminate)**

### Entry points

- `start-pod` — creates pod, waits for RUNNING, waits for ComfyUI to be healthy. Refuses if an active pod pointer already exists. Prints SSH details at the end.
- `stop-pod` — idempotent: stops pod (if stopping is possible), waits for EXITED, terminates, clears pointer. No-op if no pointer exists.

### Shared state

A JSON pointer file stores pod details (id, comfyUrl, etc.). Written immediately after create, deleted only after confirmed terminate. **Never delete it manually while a pod may be billable.** If stop fails, the pointer is kept so you can retry.

### Submodules

- **`common.mjs`** — shared constants (pod image, allowed CUDA versions)
- **`state.mjs`** — read/write/clear the active pod pointer file
- **`pods.mjs`** — RunPod API client: create, get, stop, terminate, status polling, health check
- **`list-types.mjs`** — list available GPU types, filter by CUDA version
- **`pod-images.mjs`** — named image keys mapped to RunPod image IDs
- **`start-pod.mjs`** — CLI entry point: validate env, resolve image, create pod
- **`stop-pod.mjs`** — CLI entry point: read pointer, stop/terminate, clear pointer

### Required env vars

- `RUNPOD_API_KEY` — all operations
- `RUNPOD_STATE_PATH` (optional) — override the pod pointer file location

### GPU selection

`start-pod` lists available GPU types, filters by allowed CUDA version, and picks one. If none available, fails immediately. The pod image defaults to the standard ComfyUI image but can be overridden by passing an image key as the first argument.

### Testing

Tests cover pod lifecycle state transitions, API error handling, and pointer file management.
