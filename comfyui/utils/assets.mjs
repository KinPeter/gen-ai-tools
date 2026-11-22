import path from "node:path";
import { isInsideDir, isFileHere, collectMatches } from "./paths.mjs";

// comfyui/ in this repo is the asset base when COMFY_ASSETS_PATH is unset, so
// the example input and base workflow JSONs that ship here keep resolving in a
// clean checkout. This file is the single owner of that fallback.
export const REPO_ASSETS_DIR = path.join(import.meta.dirname, "..");
export const REPO_ASSET_DIRS = assetDirs(REPO_ASSETS_DIR);

// The batch always reads inputs from <assets>/inputs and base workflows from
// <assets>/workflows, whatever the asset base happens to be.
export function assetDirs(assetsPath) {
  return {
    assetsPath,
    inputsDir: path.join(assetsPath, "inputs"),
    workflowsDir: path.join(assetsPath, "workflows"),
  };
}

// The job only ever names the file, never where it sits, so the extension is
// added here when the caller left it off (`new-images`, `krea2.json`).
export function assetFileName(name, ext) {
  const value = String(name);
  return value.endsWith(ext) ? value : `${value}${ext}`;
}

/**
 * Resolve the asset base from the environment. COMFY_ASSETS_PATH is taken
 * literally and must be absolute, so the lookup never depends on the current
 * directory; unset or blank falls back to comfyui/ in this repo.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ assetsPath: string, inputsDir: string, workflowsDir: string }}
 * @throws when a value that is set is not an absolute path.
 */
export function resolveAssetPaths(env) {
  const raw = env.COMFY_ASSETS_PATH;
  const value = raw == null ? "" : String(raw).trim();
  if (value === "") return REPO_ASSET_DIRS;
  if (!path.isAbsolute(value)) {
    throw new Error(
      `COMFY_ASSETS_PATH must be an absolute path: ${JSON.stringify(value)}`,
    );
  }
  return assetDirs(path.normalize(value));
}

/**
 * Locate `name` below `baseDir`: the asset trees are flat or nested to an
 * unknown depth, so a file name is the only stable handle on a file. An exact
 * location is tried first (`<baseDir>/<name>`, which keeps a `sub/<name>` form
 * pointing where it says), and only a miss starts the recursive search by file
 * name. Symlinked files are found; symlinked folders are not followed, which
 * keeps the walk free of cycles.
 *
 * @param {string} baseDir - folder to search, e.g. an asset base.
 * @param {string} name - file name with extension, or `<sub>/<name>.<ext>`.
 * @returns {Promise<string>} the matching path.
 * @throws when the name escapes baseDir, when nothing matches, or when the file
 *   name matches more than one file and no exact location wins.
 */
export async function findAssetPath(baseDir, name) {
  const base = path.resolve(baseDir);
  const value = String(name ?? "").trim();
  const candidate = path.join(base, value);
  if (value === "" || path.isAbsolute(value) || path.dirname(value) === "..") {
    throw new Error(
      `Invalid asset name ${JSON.stringify(name)}: a file name inside ${base}`,
    );
  }
  if (!isInsideDir(base, candidate)) {
    throw new Error(
      `Asset name ${JSON.stringify(name)} escapes ${base}: ${candidate}`,
    );
  }
  if (await isFileHere(candidate)) return candidate;
  const fileName = path.basename(value);
  const matches = await collectMatches(base, fileName);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1)
    throw new Error(`Ambiguous "${fileName}": ${matches.join(", ")}`);
  throw new Error(`No file "${fileName}" found under ${base}`);
}
