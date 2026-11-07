# Shell scripts

A collection of convenience scripts to register on your active shell. Sourcing `session.sh` defines the commands in the current shell session only — nothing is installed globally.

```sh
source ./session.sh
# Registered: start-pod, stop-pod, comfy-batch <input-name>,
#             runpod-comfy [-p <image-key>] -i <input1,..>, comfy -i <input1,..>
```

## Commands

| Command                                 | What it does                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `comfy-batch <input-name>`              | Runs one batch from `comfyui/inputs/<input-name>.yaml`.                         |
| `comfy -i <input1,input2,...>`          | Runs a batch for each input against the ComfyUI that is already running.        |
| `start-pod [image-key]`                 | Creates a RunPod GPU pod and waits for it to be ready.                          |
| `stop-pod`                              | Stops and terminates the active pod.                                            |
| `runpod-comfy [-p <image-key>] -i <..>` | Full run: start a pod, batch each input, always stop the pod — even on failure. |

Each command is a thin wrapper over the matching npm script or Node entry point. A failed input does not stop the remaining ones; the exit code is non-zero if anything failed, and `130` on Ctrl+C.
