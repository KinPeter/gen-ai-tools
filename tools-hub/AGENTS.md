# tools-hub/ AGENTS.md

## Purpose

A plain Node.js HTTP server for serving the local browser UIs and JSON API
routes. It is the local counterpart to the planned `ai-gateway/` stack.

## Architecture

**tools-hub** is a single-process server built on Node's `http` module — no
Express, no framework. Runtime dependencies: `dotenv` and `mongodb`. Vite is a
devDependency, imported lazily by the UI build. Configuration comes from `.env`
via `dotenv/config`.

Routing is two flat lists checked in order, first match wins, then a plain 404:

1. **Static UI routes** — mounted at clean paths (`/logfinder`, `/distbrowser`,
   `/assets`).
2. **API routes** — mounted under `/api/<module>`.

### Route contract

Every route, static or API, is `{ testUrl, serve }`:

- `testUrl(url)` — raw request URL string (query string included). Returns
  whether the route handles it.
- `serve(req, res)` — raw Node `IncomingMessage` / `ServerResponse`. Sets status
  and headers, writes the body.

Routes are created by factory functions, not classes, so they can carry their own
state (paths, dist dir) without globals. `static/index.mjs` builds the static
registry via `createStaticRoutes(options)`; `api/index.mjs` exports a module-level
array. Register new routes in the matching list — order sets precedence.

### Static UIs

| Route          | Source                                   | Notes                                                                                                                                         |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/`      | `tools-hub/assets/`                      | Any file under `/assets/`, 404 on missing                                                                                                     |
| `logfinder/`   | `logging/logfinder-ui/index.html`        | Serves the same HTML for every `/logfinder` sub-path                                                                                          |
| `distbrowser/` | `dist-browser/dist/` (Vite build output) | SPA fallback to `index.html` only for genuine 404s; traversal → 403, read failure → 500, non-GET/HEAD → 405, no build → 404 with a build hint |

The dist-browser dist directory comes from `distBrowserUiPaths()` in
`utils/path.mjs`; `createStaticRoutes({ distBrowserUiDistDir })` and
`createServerInstance(options)` override it (used by the tests with a fixture).
The Vite `base` is `/distbrowser/` (from `utils/constants.mjs`) so built asset
URLs match the mount path; the Vite dev server uses `base: "/"` and proxies
`/api` to tools-hub.

All MIME types come from one map in `utils/file.mjs` (`getContentType`); text
types carry `; charset=utf-8`, unknown extensions fall back to
`application/octet-stream`. Files are read from disk per request — no caching.

### API routes

`api/` has one subfolder per domain, handlers grouped under `handlers/`:

- `api/logging/find-log.mjs` — `GET /api/logging/find-log?filename=<image>`.
  Delegates to `logging/mongodb/find-log.mjs` (`findLogEntry` +
  `normalizeFilename`). 400 without the param, 404 when no entry, 503 when the
  database is unavailable.
- `api/dist-browser/` — `fs` (directory listing of `dist/`, folders first, image
  entries only), `images` (raw image bytes), `trash` (POST `{ paths: [...] }` →
  moves into `dist/.trash/`, renaming on collision, returns `{ ok, errors }`).
  All three take `baseDir` (default repo-root `dist/`) and reject paths that
  escape it with 403.

Handlers use `sendJSON` / `sendError` from `utils/http.mjs`.

### Shared MongoDB connection

`utils/db.mjs` owns the lifecycle: `start()` calls `openDb()` before listening,
the shutdown handler calls `closeDb()` after the server stops. Handlers never
create, receive or close a connection — they import a named collection getter
(`getImageLogCollection()`) from the utils barrel. Add one named getter per new
collection (`getCollection(name)` is internal). Database name `gen-ai`,
collection `image-logs`, URI from `MONGODB_URI`. If `openDb()` fails at startup
the server still runs; every getter then throws `DbUnavailableError` and the
route answers 503.

### Shared utils

`utils/` is one file per concern (`path.mjs`, `file.mjs`, `http.mjs`,
`request.mjs`, `db.mjs`, `constants.mjs`) and `utils/index.mjs` is the only
export surface — consumers inside `tools-hub/` import from the barrel, never
from a util file directly. Put new helpers in their own module and re-export them
from `index.mjs`.

Path helpers: `resolveUp(file, levels)` walks up N directories (replaces nested
`dirname()` calls), `resolveRepoRoot(relPath)` resolves against the repo root,
and `resolveBase(baseDir, relPath)` returns `{ resolved, safe }` with traversal
protection. `parseBody(req)` caps request bodies at `MAX_BODY_SIZE` (1 MB).
`IMAGE_EXTENSIONS` (`jpg`, `jpeg`, `png`) is shared with the UI and imported from
`dist-browser/src/utils/is-image.mjs`.

### Lifecycle

`index.mjs` loads `.env`, builds the React app (`static/distbrowser/ui-build.mjs`,
skipped when `TOOLS_HUB_SKIP_UI_BUILD` is `1`/`true`/`yes`; a failed build is
logged, not thrown, so existing artifacts still serve), then calls
`start(port)` — opens the database (best-effort), creates the server, listens.
`start()` returns `stop()`, which closes the HTTP server and the database
connection; `SIGINT`/`SIGTERM` call it.

`static/distbrowser/ui-build.mjs` is the only place that touches Vite. It calls
`build()` with `dist-browser/` as the root and writes to `dist-browser/dist/`.

### Configuration

| Env var                   | Default | Effect                                           |
| ------------------------- | ------- | ------------------------------------------------ |
| `TOOLS_HUB_PORT`          | `4218`  | Listening port                                   |
| `TOOLS_HUB_SKIP_UI_BUILD` | unset   | `1`/`true`/`yes` skips the Vite build at startup |
| `MONGODB_URI`             | —       | Required for DB-backed routes                    |

## Design principles

- **One interface, two categories.** Static and API routes share the
  `{ testUrl, serve }` contract; adding a route means adding a file and
  registering it.
- **Factories for state.** Routes carry configuration through their factory
  arguments instead of globals.
- **Fail explicitly.** Missing files, traversal attempts, unsupported methods
  and an unavailable database each get their own status (404 / 403 / 405 / 503),
  never a generic 404 or 500.
- **Route order matters.** Static routes are matched before API routes.

## Tests

Vitest tests live in `test/tools-hub/` (server, static routes, API handlers,
utils). `createServerInstance(options)` accepts a fixture dist directory so the
distbrowser route is testable without a real Vite build.
