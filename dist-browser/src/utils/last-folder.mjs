/**
 * Single source of truth for the "last visited folder" kept in localStorage.
 *
 * The dist root is the empty path. Writing the root *removes* the entry, so
 * "no entry" and "root" mean the same thing and a stale subfolder can never
 * be restored after the user has gone back to the root.
 */
export const LAST_FOLDER_KEY = "dist-browser-last-folder";

/**
 * Normalize a folder path relative to the dist root.
 *
 * The root always collapses to the empty string: "", "/", "//", ".", "./"
 * and ".." all become "". Leading, trailing and repeated slashes are removed,
 * "." segments are dropped, and ".." segments pop one level (never above the
 * root): "random//nested/" -> "random/nested", "a/../b" -> "b". That matches
 * what the server's path.resolve does, and guarantees a tampered or corrupt
 * storage value can never ask for a path outside the dist root (the server
 * answers 403 for those, which would strand the UI on an error).
 *
 * Segment names are otherwise kept verbatim, so a folder literally named
 * " my folder " stays addressable; only segments that are empty or pure
 * whitespace are dropped, since those are an empty path spelled differently.
 * Backslashes are treated as separators.
 *
 * @param {unknown} path - Raw path from the UI or from localStorage.
 * @returns {string} Normalized path, or "" for the dist root.
 */
export function normalizeFolderPath(path) {
  if (typeof path !== "string") return "";

  const segments = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (segment === "." || segment === "" || segment.trim() === "") continue;

    if (segment === "..") {
      // ".." walks back one level, but never past the dist root.
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/");
}

/**
 * Path of the folder one level above `path`, or "" for the dist root.
 * @param {unknown} path - Folder the ".." navigation is leaving.
 * @returns {string} Parent path, or "" for the dist root.
 */
export function parentFolderPath(path) {
  const normalized = normalizeFolderPath(path);
  if (!normalized) return "";
  return normalized.includes("/")
    ? normalized.slice(0, normalized.lastIndexOf("/"))
    : "";
}

/**
 * Read the last visited folder. Missing, empty or unusable storage all
 * resolve to the dist root.
 * @returns {string} Normalized folder path, or "" for the dist root.
 */
export function readLastFolder() {
  if (typeof window === "undefined") return "";

  let stored;
  try {
    stored = localStorage.getItem(LAST_FOLDER_KEY);
  } catch {
    // Storage can be unavailable (private browsing, blocked cookies)
    return "";
  }
  return normalizeFolderPath(stored);
}

/**
 * Persist the last visited folder. The dist root clears the entry instead of
 * storing a marker so the read path has one representation of "root".
 * @param {unknown} path - Folder the user is currently viewing.
 */
export function writeLastFolder(path) {
  if (typeof window === "undefined") return;

  const normalized = normalizeFolderPath(path);

  try {
    if (normalized === "") {
      localStorage.removeItem(LAST_FOLDER_KEY);
    } else {
      localStorage.setItem(LAST_FOLDER_KEY, normalized);
    }
  } catch {
    // Never break browsing because storage is unavailable.
  }
}
