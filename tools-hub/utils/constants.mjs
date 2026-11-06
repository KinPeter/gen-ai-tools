import { IMAGE_EXTENSIONS } from "../../dist-browser/src/utils/is-image.mjs";

export const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
export { IMAGE_EXTENSIONS };

/** Mount path of the dist-browser UI served by tools-hub. */
export const DIST_BROWSER_UI_ROUTE_PATH = "/distbrowser";
/** Vite `base` used for the production build so asset URLs match the route. */
export const DIST_BROWSER_UI_BASE_PATH = `${DIST_BROWSER_UI_ROUTE_PATH}/`;
/** Source directory of the React app (relative to the repo root). */
export const DIST_BROWSER_UI_SOURCE_DIR = "dist-browser";
/** Vite build output directory (relative to the repo root). */
export const DIST_BROWSER_UI_DIST_DIR = "dist-browser/dist";
/** Entry file of the built UI, used to detect whether the UI has been built. */
export const DIST_BROWSER_UI_INDEX_FILE = "index.html";
/** Env var that skips the startup UI build. */
export const SKIP_UI_BUILD_ENV_VAR = "TOOLS_HUB_SKIP_UI_BUILD";
