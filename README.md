# Generative AI tools

A collection of tools for working with generative AI: batch image generation against ComfyUI, a local UI and API hub, log storage and lookup, GPU pod management, and a set of AI-agent workflows that drive them from the terminal. Each module has its own README with the details.

## Modules

| Module                                   | What it is                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| [comfyui](./comfyui/README.md)           | Runs batch image generation from YAML input files against a local or remote ComfyUI. |
| [tools-hub](./tools-hub/README.md)       | Local Node HTTP server that serves the browser UIs and JSON API routes.              |
| [logging](./logging/README.md)           | Stores and queries ComfyUI generation logs in MongoDB.                               |
| [dist-browser](./dist-browser/README.md) | React app for browsing the generated images and their log entries.                   |
| [runpod](./runpod/README.md)             | Scripts to create, wait for, stop and terminate RunPod GPU pods.                     |

## Usage

Convenience commands for the everyday workflow are registered on your shell by sourcing `session.sh` — see [shell-scripts](./shell-scripts/README.md). All other available scripts and commands are listed in `package.json`.

## Agents and workflows

The agent definitions, commands and skills live in `.opencode/`.

- **Delivery** — `/deliver <requirement or file>` runs a requirement through implementation, independent review and review fixes, ending with QA evidence and a suggested commit message.
- **Tests** — `/tests <scope>` writes or updates tests, reviews them, and fixes test-side findings.
- **Image input helpers** — `/image-input` generates ComfyUI batch input YAML files, with subagents that validate the YAML and look up generation logs.

### Agent tools

The CLI scripts the agents call are in [agent-tools](./agent-tools/README.md): validate a batch input file, look up one image's log entry, search the log collection.

## Development

```sh
cp .env.example .env   # then fill in values
npm install
```

Used: Node 24 (ES modules), Vitest, ESLint, Prettier, Vite + React, sharp, yaml, dotenv, MongoDB.
