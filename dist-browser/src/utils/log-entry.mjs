/**
 * Pure helpers for mapping image filenames to log entries and for resolving
 * the `.png` filename that a ComfyUI log entry uses for a given image.
 */

/**
 * Convert an image filename to the `.png` filename stored in log entries.
 *
 * `bp-cp_20261005233501.jpg` → `"bp-cp_20261005233501.png"`
 * `bp-cp_20261005233501.jpeg` → `"bp-cp_20261005233501.png"`
 *
 * @param {string} filename - Image filename (any extension).
 * @returns {string} Filename with `.png` extension.
 */
export function logFilename(filename) {
  if (typeof filename !== "string") return "";
  return filename.replace(/\.[^.]+$/, ".png");
}

/**
 * Map an image entry to its generation log entry by looking up the matching
 * `.png` filename in the cached log entries array.
 *
 * @param {object|null} imageEntry - Selected image listing entry.
 * @param {Array<object>} logEntries - Cached entries from `GET /api/logs`.
 * @returns {object|null} Matching log entry, or null.
 */
export function matchLogEntry(imageEntry, logEntries) {
  if (!imageEntry) return null;

  const target = logFilename(imageEntry.name);
  return logEntries?.find((entry) => entry.filename === target) ?? null;
}
