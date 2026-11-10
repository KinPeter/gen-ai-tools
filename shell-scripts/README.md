# Shell scripts

A collection of convenience scripts to register on your active shell. Sourcing `session.sh` defines the commands in the current shell session only — nothing is installed globally. Works in zsh (the macOS default) and bash.

```sh
source ./session.sh
# Registered:
#   ...the list of commands
```

## Commands

| Command                                 | What it does                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `comfy-batch <input-name>`              | Runs one batch from `comfyui/inputs/<input-name>.yaml`.                         |
| `comfy -i <input1,input2,...>`          | Runs a batch for each input against the ComfyUI that is already running.        |
| `start-pod [image-key]`                 | Creates a RunPod GPU pod and waits for it to be ready.                          |
| `stop-pod`                              | Stops and terminates the active pod.                                            |
| `runpod-comfy [-p <image-key>] -i <..>` | Full run: start a pod, batch each input, always stop the pod — even on failure. |
| `thub start`                            | Starts tools-hub detached, port from `.env`, logs to `.tmp/tools-hub.log`.      |
| `thub status`                           | Reports the PID, port and log file, or says the server is not running.          |
| `thub stop`                             | Sends SIGINT (Ctrl+C equivalent), then SIGTERM if it lingers.                   |
| `thub restart`                          | Stops the server, then starts it again and rebuilds the browser UI.             |

Each command is a thin wrapper over the matching npm script or Node entry point. A failed input does not stop the remaining ones; the exit code is non-zero if anything failed, and `130` on Ctrl+C.

`thub` notes:

- `thub restart` with nothing running simply starts the server.
- The rebuild is skipped when `TOOLS_HUB_SKIP_UI_BUILD=1|true|yes` is set in `.env`.
- `thub stop` and `thub restart` only touch the PID recorded in `.tmp/tools-hub.pid`; a process on the port that thub did not start is reported and left alone, and `thub restart` aborts while the port is still in use.
