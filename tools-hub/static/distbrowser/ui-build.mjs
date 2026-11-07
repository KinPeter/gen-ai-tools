import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  DIST_BROWSER_UI_INDEX_FILE,
  SKIP_UI_BUILD_ENV_VAR,
  distBrowserUiPaths,
} from "../../utils/index.mjs";

const TRUTHY_VALUES = new Set(["1", "true", "yes"]);

/**
 * True when the startup UI build should be skipped
 * (TOOLS_HUB_SKIP_UI_BUILD=1|true|yes).
 */
export function isUiBuildSkipped(env = process.env) {
  const value = String(env[SKIP_UI_BUILD_ENV_VAR] ?? "").toLowerCase();
  return TRUTHY_VALUES.has(value);
}

/**
 * True when the Vite build output contains the UI entry file.
 */
export function hasUiArtifacts(distDir) {
  return existsSync(join(distDir, DIST_BROWSER_UI_INDEX_FILE));
}

/**
 * Build the dist-browser React app with Vite.
 *
 * Vite is a devDependency, so it is imported lazily and any failure is
 * reported instead of thrown. `emptyOutDir` can wipe the previous build
 * before Vite fails, so the log states explicitly whether artifacts are
 * still available.
 *
 * @returns {Promise<{built: boolean, skipped: boolean, distDir: string,
 *   artifactsAvailable: boolean, error?: Error}>}
 */
export async function buildDistBrowserUi({
  env = process.env,
  log = console,
  paths = distBrowserUiPaths(),
} = {}) {
  const { root, distDir } = paths;

  if (isUiBuildSkipped(env)) {
    log.log(`UI build skipped (${SKIP_UI_BUILD_ENV_VAR} is set)`);
    return {
      built: false,
      skipped: true,
      distDir,
      artifactsAvailable: hasUiArtifacts(distDir),
    };
  }

  try {
    const { build } = await import("vite");
    await build({ root, build: { outDir: distDir, emptyOutDir: true } });
    log.log(`dist-browser UI built into ${distDir}`);
    return { built: true, skipped: false, distDir, artifactsAvailable: true };
  } catch (err) {
    const artifactsAvailable = hasUiArtifacts(distDir);

    log.error(`dist-browser UI build failed: ${err.message}`);
    log.log(
      artifactsAvailable
        ? `Serving existing UI artifacts from ${distDir}`
        : `No UI artifacts in ${distDir} — run "npm run dist-browser:build" or restart tools-hub without ${SKIP_UI_BUILD_ENV_VAR}`,
    );

    return {
      built: false,
      skipped: false,
      distDir,
      artifactsAvailable,
      error: err,
    };
  }
}

export default buildDistBrowserUi;
