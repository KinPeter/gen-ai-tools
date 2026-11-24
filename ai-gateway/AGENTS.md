# ai-gateway/ AGENTS.md

## Purpose

LAN-facing HTTP server for the AI machines. It serves a temporary status page
and static assets, and accepts file uploads/deletions for the ComfyUI `input/`
folders of the AI server's machines (one mount per instance). No database, no
auth, no Vite build.

## Entry points

- `index.mjs` — `npm run ai-gateway`.
  Loads `.env`, reads `AIGW_PORT`, computes the LAN address, starts the server,
  and wires `SIGINT`/`SIGTERM` to the shutdown handler.
- `server.mjs` — `createServerInstance(options)` builds the `http.Server` (static
  routes then API routes, first match wins, then a plain 404); `start({ port,
lanAddress })` listens on `0.0.0.0` and returns `stop()`. Also re-exports
  `apiRoutes` and `createStaticRoutes`.

## Architecture

Routing is two flat lists, matching the tools-hub pattern:

1. **Static routes** — mounted at clean paths (`/`, `/assets/*`), first match wins.
2. **API routes** — mounted under `/api/<module>`, first match wins.

Every route, static or API, is `{ testUrl, serve }`:

- `testUrl(url)` — raw request URL string (query string included). Returns
  whether the route handles it.
- `serve(req, res)` — raw Node `IncomingMessage` / `ServerResponse`. Sets status
  and headers, writes the body.

Routes are created by factory functions, not classes, so they can carry their own
configuration (paths, env var, log prefix) without globals. Static routes are
built per-server by `createStaticRoutes(options)`; the API routes are a
module-level array exported from `api/index.mjs`. Register a new route in the
matching list — order sets precedence.

### API routes

`api/index.mjs` composes the mounts:

```js
export default [...myImageUploads, ...cyImageUploads];
```

Image uploads are layered so each mount is a three-field wrapper over shared
code, not a copy:

| File                                    | Role                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `api/my-image-uploads/index.mjs`        | Thin wrapper: `{ prefix: "/api/my-image-uploads", envVar: "AIGW_MY_IMAGE_UPLOADS_FOLDER", label: "my-image-uploads" }` |
| `api/cy-image-uploads/index.mjs`        | Thin wrapper: `{ prefix: "/api/cy-image-uploads", envVar: "AIGW_CY_IMAGE_UPLOADS_FOLDER", label: "cy-image-uploads" }` |
| `api/shared/image-uploads/index.mjs`    | `createImageUploadsRoutes(ctx)` → `[list, delete, upload]` (that order)                                                |
| `api/shared/image-uploads/test-url.mjs` | `createTestUrl(path)` — exact path or trailing-slash variant, query string stripped; sub-paths fall through to 404     |
| `api/shared/image-uploads/list.mjs`     | `createListRoute(ctx)` — GET                                                                                           |
| `api/shared/image-uploads/upload.mjs`   | `createUploadRoute(ctx)` — POST multipart                                                                              |
| `api/shared/image-uploads/delete.mjs`   | `createDeleteRoute(ctx)` — POST JSON                                                                                   |

To add a new image-uploads mount: create a folder `api/<mount>/index.mjs` with
the same wrapper shape, and add it to `api/index.mjs`. Only the `prefix`,
`envVar` and `label` change — never copy the logic.

- **list** — `GET <prefix>/list`. Lists plain filenames in the configured folder
  (sorted alphabetically); directories, symlinks and other entries are excluded.
  200 answers `{ "files": [...] }` (`[]` when empty); 405 for any other method
  (`Allow: GET`); 503 when the env var is missing/empty or the folder cannot be read.
- **upload** — `POST <prefix>/upload`. Saves one uploaded file inside the
  configured folder. Body is `multipart/form-data` (native parser, no
  dependencies) with a 50 MB file cap and 1 MB of body overhead (`MAX_BODY_BYTES`).
  The filename is sanitized to a plain basename (`stripBasename`), then deduped —
  `name`, `stem-1.ext`, `stem-2.ext`, … — so an existing file is never
  overwritten. 200 answers `{ "saved": "<filename>" }`; 405 for any other method
  (`Allow: POST`); 400 for a malformed multipart body, missing file part or
  invalid filename; 413 for an oversized file/body; 503 when unconfigured, or the
  folder is missing/unavailable/not a directory.
- **delete** — `POST <prefix>/delete`. Deletes the files named in the JSON body
  (`{ "files": [...] }`) in the configured folder. Only plain basenames
  (`isPlainBasename`); names that are invalid, out-of-folder, or fail to delete
  (not found, directory, permission) are logged and skipped, never counted.
  200 answers `{ "deleted": N }` where N is the number actually deleted; 405 for
  any other method (`Allow: POST`); 400 for a malformed body; 503 when
  unconfigured, missing or unreadable.

Error convention: `{ "error": message }` JSON from `sendError` / `sendJSON` in
`utils/http.mjs`. Details (paths, I/O errors) are logged server-side and are
never returned to the client. 405s carry an `Allow` header.

### Static routes

- `static/index.mjs` — `createStaticRoutes(options)` returns
  `[assets(), status(statusOptions)]`.
- `static/assets/index.mjs` — `/assets/*` from `ai-gateway/assets/`. 404 on the
  bare mount (`/assets`, `/assets/`), traversal → 403, missing file → 404, other
  read failure → 500. Content type from the single `getContentType` map in
  `utils/file.mjs` (text types carry `charset=utf-8`, unknown → `application/octet-stream`).
- `static/status/index.mjs` — `/` and `/index.html` (query string ignored,
  trailing slashes normalized). A temporary static status page rendered once at
  factory time (port, LAN URL, mounts).

### Shared utils

`utils/` — one file per concern, imported directly (no barrel):

| File            | Contents                                                                                                                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request.mjs`   | `parseBody(req)` — raw text, 1 MB cap (same cap as tools-hub). `parseBodyBuffer(req, maxBytes)` — binary, drains oversize bodies and rejects with `code: "BODY_TOO_LARGE"` (server answers 413).                                                                  |
| `multipart.mjs` | `parseMultipart({ body, boundary })` — minimal binary-safe multipart parser; parts carry `{ name, filename, content: Buffer }`. Does NOT reconstruct or decode anything. Known limitation: binary content embedding the literal boundary delimiter is miscounted. |
| `file.mjs`      | `getContentType(filePath)` (single MIME map), `resolveBase(baseDir, relPath)` → `{ resolved, safe }` with traversal protection, `normalizePathSegment`, `isPlainBasename(name)` (delete gate), `stripBasename(name)` (upload gate).                               |
| `http.mjs`      | `sendJSON(res, status, data, extraHeaders)` / `sendError(res, status, message, extraHeaders)` — content headers always win over extras; extras carry e.g. `Allow`.                                                                                                |
| `path.mjs`      | `resolveUp(file, levels)`, `resolveRepoRoot(relPath)`.                                                                                                                                                                                                            |
| `network.mjs`   | `primaryLanAddress()` — first non-internal IPv4, or `null` (used to log the LAN URL at startup).                                                                                                                                                                  |

### Lifecycle

`index.mjs` loads `.env` (`dotenv/config`), resolves `AIGW_PORT` (default 4218)
and the LAN address, then calls `start({ port, lanAddress })`. The server binds
to `0.0.0.0` (the gateway runs on the home AI server; other computers reach it
over the LAN) and logs the LAN URL at startup. `stop()` closes the server and
is called on `SIGINT`/`SIGTERM` (exit 0); an unhandled startup failure exits 1.

### Configuration

| Env var                        | Default | Effect                                                        |
| ------------------------------ | ------- | ------------------------------------------------------------- |
| `AIGW_PORT`                    | `4218`  | Listening port                                                |
| `AIGW_MY_IMAGE_UPLOADS_FOLDER` | unset   | Folder for `/api/my-image-uploads/*`; 503 when unset or empty |
| `AIGW_CY_IMAGE_UPLOADS_FOLDER` | unset   | Folder for `/api/cy-image-uploads/*`; 503 when unset or empty |

Both folder env vars are documented in `.env.example`.

## Design principles

- **One interface.** Static and API routes share the `{ testUrl, serve }` contract; adding a route means adding a file and registering it.
- **Factories for state.** Routes carry configuration through factory arguments (`{ prefix, envVar, label }`) instead of globals; per-mount code is a wrapper, not a copy.
- **Fail explicitly.** Missing files, traversal attempts, unsupported methods and unreadable folders each get their own status (403 / 404 / 405 / 413 / 503), never a generic 404 or 500.
- **Route order matters.** Static routes are matched before API routes; the API registry's order is preserved as the match order.

## Testing

There is no test suite for ai-gateway (`test/` has nothing for it). Verification is
manual: start `npm run ai-gateway` with the env vars set, then exercise the
endpoints against a live server (list `/list`, upload `/upload`, delete
`/delete`, checking both `/api/my-image-uploads/*` and `/api/cy-image-uploads/*`
for folder isolation). Any change to the shared factory in
`api/shared/image-uploads/` must be re-verified on every mounted prefix.
