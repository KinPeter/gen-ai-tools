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

| Route                      | Method | Description                                   |
| -------------------------- | ------ | --------------------------------------------- |
| `/api/logging/find-log`    | GET    | One generation log entry: `?filename=<image>` |
| `/api/dist-browser/fs`     | GET    | Directory listing of `dist/`, folder-first    |
| `/api/dist-browser/images` | GET    | Serves an image file from `dist/`             |
| `/api/dist-browser/trash`  | POST   | Moves `paths: [...]` to `dist/.trash/`        |

The logging route needs `MONGODB_URI`; if the connection fails at startup the
server still runs and that route answers 503.
