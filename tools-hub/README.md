# tools-hub

Local Node HTTP server (no framework, Node `http` only) that serves the browser
UIs and JSON API routes used by the local tools.

```sh
npm run tools-hub          # node tools-hub/index.mjs
TOOLS_HUB_PORT=5000 npm run tools-hub
```

## Served UIs

| Path           | What it serves                                  |
| -------------- | ----------------------------------------------- |
| `/distbrowser` | dist-browser React app (`dist-browser/dist/`)   |
| `/logfinder`   | `logging/logfinder-ui/index.html`               |
| `/assets`      | `tools-hub/assets/` (favicons, icons, manifest) |

The React app is built with Vite at startup. Set `TOOLS_HUB_SKIP_UI_BUILD=1` to
skip the build and reuse existing artifacts. Run `npm run dist-browser:dev` for
hot reload — its `/api` requests are proxied to tools-hub.

## API routes

| Route                       | Method | Description                                   |
| --------------------------- | ------ | --------------------------------------------- |
| `/api/logging/find-log`     | GET    | One generation log entry: `?filename=<image>` |
| `/api/logging/search-logs`  | POST   | Log entries by filter: `{ filters, limit }`   |
| `/api/comfy/validate-input` | POST   | Validates a batch input YAML from the body    |
| `/api/dist-browser/fs`      | GET    | Directory listing of `dist/`, folder-first    |
| `/api/dist-browser/images`  | GET    | Serves an image file from `dist/`             |
| `/api/dist-browser/trash`   | POST   | Moves `paths: [...]` to `dist/.trash/`        |

### Examples

```sh
BASE=http://localhost:4218   # routes load at startup: restart tools-hub to see a new one

curl -s "$BASE/api/logging/find-log?filename=dmoss_20261118142116"
curl -s -X POST "$BASE/api/logging/search-logs" \
  -d '{"workflow":"dmoss","outputFolder":"dmoss","limit":2}'
curl -s -X POST --data-binary @comfyui/inputs/input.example.yaml \
  "$BASE/api/comfy/validate-input"        # {"valid":true}
curl -s "$BASE/api/dist-browser/fs/dmoss"
curl -s -o cover.jpg "$BASE/api/dist-browser/images/dmoss/dmoss_20261118142116.jpg"
curl -s -X POST "$BASE/api/dist-browser/trash" \
  -d '{"paths":["<folder>/<name>.jpg"]}'  # moves into dist/.trash/, answers ok:false if missing
```

`/api/comfy/validate-input` answers 200 for both verdicts: `{"valid":true}` or
`{"valid":false,"error":"<first reason>"}`. `Content-Type` is ignored, so plain
`curl --data-binary @file.yaml` works, and `valid: true` says the fields are
well-formed — not that the `comfyui/workflows/<name>.json` it names is on disk.
The two logging routes need `MONGODB_URI`; if the connection fails at startup
the server still runs and they answer 503.
