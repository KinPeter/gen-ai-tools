# tools-hub/ AGENTS.md

## Purpose

A plain Node.js HTTP server for serving static UIs and API endpoints locally.
It acts as the local counterpart to the `ai-gateway/` stack, providing a
lightweight way to run UIs and API routes without external dependencies.

## Architecture

### Core concepts

**tools-hub** is a single-process HTTP server built on Node's built-in
`http` module. It has zero external runtime dependencies — no Express, no
MongoDB driver at the server level (that lives in the logging module). It
loads configuration from `.env` via `dotenv/config`.

The server has two layers of routing:

1. **Static UI routes** — serve HTML (and other static assets) for browser-based
   tools like the Log Finder UI. These mount at clean paths (e.g. `/logfinder`).
2. **API routes** — handle structured requests (typically JSON) and proxy to
   lower-level modules (currently MongoDB-backed logging). These mount under
   `/api/<module>`.

### Routing model

Every route — whether static or API — follows the same interface: a function
that returns `{ testUrl, serve }`.

- `testUrl(url)` — receives the raw request URL string. Returns `true` if the
  route should handle this request. URL query strings are part of the URL, so
  route matchers should account for them (e.g. `/api/logging/find-log?filename=x`).
- `serve(req, res)` — receives the raw Node `IncomingMessage` and `ServerResponse`
  objects. Sets `statusCode`, headers, and writes the body.

The server iterates static routes first, then API routes, stopping at the first
match. Unmatched requests fall through to a default 404.

### Static UIs

Static UI routes serve pre-built HTML files from the repository. The UI files
live under `routes/static/<name>/` and each route is factory-function based —
it returns a new `{ testUrl, serve }` pair so routes can carry their own state
(config paths, MIME types, etc.).

Static UIs are mounted at clean paths without a `/static/` prefix. The route
registry is created once at server start and cached.

### API routes

API routes follow the same `{ testUrl, serve }` interface but handle structured
data. They typically:

1. Parse the URL (using `new URL()` for query string access).
2. Call into domain logic (e.g. MongoDB queries) via shared helpers.
3. Set `Content-Type` and write JSON responses.

API routes are organized under `routes/api/` with subfolders per domain
(e.g. `routes/api/logging/` for all logging-related endpoints). Each module
is a self-contained file that exports a factory function.

### Path resolution

The repo uses a shared `resolveUp()` helper that walks up a given number of
parent directories from a file path. This replaces deeply nested `dirname()`
calls and makes it easy to resolve paths relative to the repository root from
any depth. A convenience `resolveRepoRoot()` is also available.

### Lifecycle

The server is started by `index.mjs` which:

1. Loads `.env` (dotenv/config, top-level).
2. Reads `TOOLS_HUB_PORT` env var (default 4218).
3. Calls `start(port)` which creates the server instance and listens.
4. Installs `SIGINT` and `SIGTERM` handlers that gracefully stop the server.

The `start()` function returns a `stop()` function for clean shutdown. The
server process terminates cleanly when both handlers fire.

### Port configuration

Port is controlled by the `TOOLS_HUB_PORT` environment variable. The default
is `4218`. The `.env` file should set this if different from the default.

### Dependencies

- **Zero runtime dependencies** — uses only Node built-ins (`http`, `fs`,
  `path`, `url`) plus `dotenv` (dev dependency, loaded via `dotenv/config`).
- **Low-level module imports** — API routes import directly into `logging/`,
  `runpod/`, and other repo modules using relative paths. No coupling to the
  tools-hub structure on the dependency side.

### CLI

Run the server with:

```
npm run tools-hub
```

Or directly:

```
node tools-hub/index.mjs
```

## Design principles

- **One interface, two categories.** Static and API routes share the same
  `{ testUrl, serve }` contract. Add a new route by creating a file and
  registering it.
- **Factory functions for state.** Each route is created via a function call,
  not a class. This keeps routes stateless by default but allows them to carry
  configuration (e.g. paths, MIME types) without global state.
- **No premature optimization.** Static files are read from disk on each
  request. For the current scale this is fine; caching can be added later.
- **Route order matters.** Static routes are checked before API routes. Add
  new routes in the appropriate section and in the desired precedence order.
