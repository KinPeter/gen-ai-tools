# dist-browser

Local React app for browsing the images generated into `dist/` and reading the
ComfyUI generation log for the one you select. Served by tools-hub.

```sh
npm run tools-hub              # builds the UI and serves it
# http://localhost:4218/distbrowser

npm run dist-browser:dev       # Vite dev server with hot reload (port 5173)
npm run dist-browser:build     # manual build into dist-browser/dist/
```

The dev server proxies `/api` to tools-hub, so tools-hub must be running. The
shared styles (`/assets/theme.css`, `/assets/syntax.css`) and the favicons come
from the tools-hub `/assets` route, which the dev server does not proxy — open
the built UI through `npm run tools-hub` to see the theme. Set
`TOOLS_HUB_PORT` to change the tools-hub port, `TOOLS_HUB_SKIP_UI_BUILD=1` to
skip the startup build.

## What it does

Three columns, resizable (widths remembered between visits):

- **File Browser** — tree of `dist/`, folders first, then images. Single click
  selects, double click or Enter opens a folder, `..` walks up one level.
  Arrow keys move through the list (wrapping), Backspace goes up, Home jumps to
  the first row, Delete moves the selected file to `dist/.trash/`.
- **Image Viewer** — the selected image, with a loading spinner, an error state
  with Retry, and the filename shown below the image or as an overlay when the
  image fills the column.
- **Log Viewer** — the generation log entry for the selected image, pretty-printed
  and token-colored.

Top bar: current folder in the title, refresh (re-reads the folder and re-looks
up the log), dark/light toggle.

Remembers the last folder you viewed and your theme choice (defaults to the
system preference) in localStorage.

Only `.jpg`, `.jpeg` and `.png` files appear in the listing.

## Endpoints it calls

| Route                      | Method | Purpose                              |
| -------------------------- | ------ | ------------------------------------ |
| `/api/dist-browser/fs`     | GET    | Directory listing of `dist/`         |
| `/api/dist-browser/images` | GET    | Image bytes                          |
| `/api/dist-browser/trash`  | POST   | Move file(s) to `dist/.trash/`       |
| `/api/logging/find-log`    | GET    | Log entry for an image: `?filename=` |

The log lookup needs `MONGODB_URI` in `.env`; without it the Log Viewer reports a
lookup failure while the rest of the app still works.

## Tests

```sh
npm run test            # test/dist-browser/ covers the utils, components and hooks
```
