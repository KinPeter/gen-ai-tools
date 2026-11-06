# Dist-Browser Module

## Purpose

Vite + React browser UI for serving and browsing `dist/` outputs (JPG images from ComfyUI runs).

## Architecture

### Entry points

- **Dev server** — `npm run dist-browser:dev` runs Vite in dev mode
- **Production** — `npm run dist-browser:build` builds the frontend; `npm run dist-browser` builds and starts the Node server
- **tools-hub** — `npm run tools-hub` builds the frontend with Vite and serves
  it at `http://localhost:4218/distbrowser` (the recommended way to run the UI)

### Server

`serve.mjs` — Vite builds the frontend, then starts a Node HTTP server to serve `dist-browser/dist/` statically. Handles graceful shutdown on SIGINT. The static UI serving is duplicated by the tools-hub `routes/static/distbrowser` route; this standalone server is kept for the API-only workflow. Production builds use Vite `base: "/distbrowser/"`, so the standalone server accepts the same `/distbrowser/...` paths (the mount prefix is stripped by `stripUiPrefix` in `static-serving.mjs`).

`server.mjs` is a thin orchestrator that wires the request handler and the HTTP
server. The request handlers live in `handlers/` (`fs.mjs`, `images.mjs`,
`logs.mjs`, `trash.mjs`) and the static UI serving lives in
`static-serving.mjs`. Path helpers, MIME types and JSON responses are shared
with tools-hub through `../tools-hub/utils/index.mjs`.

### React app structure

- `src/App.jsx` — root component, manages column layout and state
- `src/context/ThemeContext.jsx` — theme provider
- **Components** (under `src/components/`):
  - `FileBrowser/` — directory tree viewer with keyboard navigation, hover, and selection
  - `ImageViewer/` — image display with size observer and load state
  - `LogViewer/` — generation log entry viewer
  - `Column/` — resizable column container
  - `ResizeHandle/` — drag-to-resize component
  - `Layout/` — overall app layout
  - `TopBar/` — app header
- **Hooks** (under `src/hooks/`):
  - `useDirectoryListing/` — fetches directory contents
  - `useFileBrowserState/` — file browser selection, navigation
  - `useColumnResize/` — column width management
  - `useImageLoadState/` — image loading progress
  - `useImageSizeObserver/` — image size tracking
  - `useSelectedEntryScroll/` — scroll management for selected items
  - `useTrashHandler/` — move files to .trash
  - `useFolderPath/` — current path tracking
  - `useFileBrowserHover/`, `useFileBrowserKeyboard/` — interaction handlers
- **Utils** (under `src/utils/`):
  - `entries.mjs` — entry sorting and comparison
  - `image-url.mjs` — image URL generation
  - `is-image.mjs` — image file detection
  - `last-folder.mjs` — persist last visited folder
  - `title.mjs` — breadcrumb title generation

### Config

`vite.config.mjs` — Vite build configuration for the React app. Production
builds set `base: "/distbrowser/"` (constant shared with tools-hub) so built
asset URLs resolve under the tools-hub route.

### Testing

Unit tests in `test/dist-browser/` using jsdom + `@testing-library/react`. Not measured by the coverage threshold (deliberately excluded).
