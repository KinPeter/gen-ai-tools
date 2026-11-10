# Dist-Browser Module

Local Vite + React SPA that browses the generated images in `dist/` and shows the
ComfyUI generation log for the selected image. tools-hub serves the built app at
`/distbrowser` and hosts every API it calls — the module has no server of its own.

## Running

| Command                      | What happens                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run dist-browser:dev`   | Vite dev server (hot reload, `base: "/"`), proxies `/api` to tools-hub — start tools-hub first                         |
| `npm run dist-browser:build` | Vite build into `dist-browser/dist/` (gitignored) with `base: "/distbrowser/"`                                         |
| `npm run tools-hub`          | Builds this UI at startup (skip with `TOOLS_HUB_SKIP_UI_BUILD=1`) and serves it at `http://localhost:4218/distbrowser` |

`vite.config.mjs` reads the build base path from `tools-hub/utils/constants.mjs`, so
the mount path and the asset URLs cannot drift apart.

## Layout

| Path              | Purpose                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`      | Shell; favicons and manifest come from the tools-hub `/assets` route.                                                                                                                                                  |
| `vite.config.mjs` | Root, build output, dev proxy.                                                                                                                                                                                         |
| `src/main.jsx`    | Mounts `App` in StrictMode.                                                                                                                                                                                            |
| `src/App.jsx`     | `Layout` wrapped in `ThemeProvider`.                                                                                                                                                                                   |
| `src/context/`    | `ThemeContext.jsx` — dark/light theme (system preference, explicit override).                                                                                                                                          |
| `src/components/` | `Layout` (three columns + wiring), `Column`, `ResizeHandle`, `TopBar` (refresh, title, theme), `FileBrowser` + `FileBrowserEntry` + `FileBrowserIcons`, `ImageViewer`, `LogViewer`. Each component has its own `.css`. |
| `src/hooks/`      | Listing, selection, trash, keyboard, hover, scroll, image load/size, log lookup, column resizing, folder path.                                                                                                         |
| `src/utils/`      | Pure helpers: entry sorting/paths, image-extension check, URL builders, folder normalization + persistence, title, JSON colorization, resize constraints.                                                              |

Convention: components render, hooks hold state and do I/O, utils are pure and
unit-testable. `Layout` is the only place the pieces are wired together.

## API calls

| Endpoint                                     | Used by               | Notes                                              |
| -------------------------------------------- | --------------------- | -------------------------------------------------- |
| `GET /api/dist-browser/fs/<path>`            | `useDirectoryListing` | `{ path, entries }`; folders and image files only  |
| `GET /api/dist-browser/images/<path>`        | `buildImageUrl`       | Raw image bytes                                    |
| `POST /api/dist-browser/trash`               | `useTrashHandler`     | Body `{ paths: [...] }`; moves into `dist/.trash/` |
| `GET /api/logging/find-log?filename=<image>` | `useImageLog`         | One generation-log entry; needs `MONGODB_URI`      |

Paths are relative to the `dist/` root (the root is the empty path). The server
answers 403 for paths that escape `dist/` and 404 for missing folders; a 403 or
404 listing resets the UI to the dist root instead of leaving it stranded on an
error. `IMAGE_EXTENSIONS` in `src/utils/is-image.mjs` is the shared definition
used by both the API handlers and the UI.

## Storage (localStorage)

| Key                                        | Owner                                     | Contents                                                |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| `dist-browser-last-folder`                 | `useFolderPath` / `utils/last-folder.mjs` | Folder being viewed; the dist root removes the entry    |
| `dist-browser-theme`                       | `ThemeContext`                            | Explicit `dark`/`light`; absent means follow the system |
| `dist-browser-col-1`, `dist-browser-col-2` | `useColumnResize`                         | Column widths in px; the third column fills the rest    |

## Behavior the hooks encode

- Listing is sorted folders first (case-insensitive alphabetical), then files,
  with a virtual `..` row prepended except at the dist root (`utils/entries.mjs`).
- A single click selects a row; only image entries populate the Image Viewer and
  Log Viewer (`..` ignores single click). Double click or Enter opens a folder or
  `..`, Backspace goes up, ArrowUp/ArrowDown walk the rows (wrapping), Home jumps
  to the first row, Delete trashes the selected entry. Nothing acts while the
  listing is loading.
- After a trash, the listing is refreshed and the row now at the deleted index
  becomes selected, so viewer and log follow the list. `/api/dist-browser/trash`
  returns 200 even for failed paths, so the body's `ok` flag is checked.
- The selected row is scrolled into view; the hover highlight is dropped whenever
  the listing changes.
- Column widths are clamped by `MIN_WIDTHS` in `utils/resize-utils.mjs`.
- The filename is labelled below the image, or overlaid when the image fills the
  column (`useImageSizeObserver`, ResizeObserver). `ImageViewer` accepts a
  test-only `isTallEnough` override that logs a dev warning.

## Generation log loading

One lookup per selected image, no bulk endpoint and no client-side cache.
`useImageLog` is keyed on the selected image path plus a refresh nonce, so
Refresh re-looks-up the image that is still selected; the request runs in
parallel with the `<img>` fetch and is aborted when the selection changes.
`utils/log-url.mjs` builds the URL and `utils/log-response.mjs` reduces the body
to a single entry — both pure. The endpoint normalises the query to the
extension-less basename (`logging/mongodb/find-log.mjs` → `normalizeFilename`),
so a full path and a bare filename resolve to the same entry. A 404 is a normal
"no log" outcome, not an error.

## Tests

`test/dist-browser/` mirrors the source: `*.test.mjs` for the pure utils,
`*.test.jsx` for components and hooks (jsdom + `@testing-library/react`, fetch
mocked with MSW, ResizeObserver polyfilled in `test/support/setup.mjs`). The
server-side routes are covered under `test/tools-hub/api/dist-browser/` and
`test/tools-hub/static/`.
