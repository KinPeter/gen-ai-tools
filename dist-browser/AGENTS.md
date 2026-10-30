# Dist-Browser Module

## Purpose

Vite + React browser UI for serving and browsing `dist/` outputs (JPG images from ComfyUI runs).

## Architecture

### Entry points

- **Dev server** — `npm run dist-browser:dev` runs Vite in dev mode
- **Production** — `npm run dist-browser:build` builds the frontend; `npm run dist-browser` builds and starts the Node server

### Server

`serve.mjs` — Vite builds the frontend, then starts a Node HTTP server to serve `dist-browser/dist/` statically. Handles graceful shutdown on SIGINT.

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
  - `useFileBrowserFocus/`, `useFileBrowserHover/`, `useFileBrowserKeyboard/` — interaction handlers
- **Utils** (under `src/utils/`):
  - `entries.mjs` — entry sorting and comparison
  - `image-url.mjs` — image URL generation
  - `is-image.mjs` — image file detection
  - `last-folder.mjs` — persist last visited folder
  - `title.mjs` — breadcrumb title generation

### Config

`vite.config.mjs` — Vite build configuration for the React app.

### Testing

Unit tests in `test/dist-browser/` using jsdom + `@testing-library/react`. Not measured by the coverage threshold (deliberately excluded).
