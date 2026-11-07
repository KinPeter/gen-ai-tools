/**
 * Build the URL for the single-entry generation log lookup used by the
 * Log Viewer.
 */

/** Endpoint that looks up one generation log entry by image filename. */
const LOG_FIND_ENDPOINT = "/api/logging/find-log";

/**
 * Build the log lookup URL for an image path or filename. The endpoint
 * normalises the value to the extension-less basename, so a full path and a
 * bare filename resolve to the same log entry.
 *
 * @param {string} filename - Image path or filename, with or without extension.
 * @returns {string}
 */
export function buildLogUrl(filename) {
  const value = String(filename ?? "").trim();
  return `${LOG_FIND_ENDPOINT}?filename=${encodeURIComponent(value)}`;
}
