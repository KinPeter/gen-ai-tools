# Dist-Browser Module

Local Vite + React UI served by tools-hub at `/distbrowser` (build output in
`dist-browser/dist/`, gitignored). Run it with `npm run dist-browser:dev` for
hot reload, or `npm run dist-browser:build` before serving through tools-hub.

## Layout

| Path              | Purpose                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/main.jsx`    | Entry point; mounts `App` inside `ThemeContext`.                                                              |
| `src/components/` | One component per visual concern (Layout, FileBrowser, ImageViewer, LogViewer, TopBar, Column, ResizeHandle). |
| `src/hooks/`      | State and I/O: directory listing, selection, trash, image loading, per-image log lookup, column resizing.     |
| `src/utils/`      | Pure helpers: URL building, entry sorting, image-type checks, JSON colorization.                              |

## Generation log loading

The Log Viewer fetches **one log entry per selected image** from
`GET /api/logging/find-log?filename=<filename>` (tools-hub →
`tools-hub/api/logging/find-log.mjs`). There is no bulk log endpoint: the old
`GET /api/dist-browser/logs` route and its client-side cache and matching are
gone.

- `hooks/useImageLog.jsx` owns the request (the only log I/O in the UI). It is
  keyed on the selected image path and a refresh nonce, so Refresh re-looks-up
  the image that is still selected.
- The lookup fires at the same time as the `<img>` request made by the Image
  Viewer, so image and log arrive in parallel.
- `utils/log-url.mjs` builds the query URL; `utils/log-response.mjs` reduces the
  response body to a single entry object. Both are pure.
- The endpoint normalises the query value to the extension-less basename
  (`logging/mongodb/find-log.mjs` → `normalizeFilename`), so a full path and a
  bare filename resolve to the same entry.

# TODO: Needs update
