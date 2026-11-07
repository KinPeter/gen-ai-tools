/**
 * Shape the body of a `GET /api/logging/find-log` response into a single log
 * entry object.
 */

/**
 * Reduce a find-log response body to one log entry. The endpoint answers with a
 * single document, or null-like values when nothing was found.
 *
 * @param {unknown} data - Parsed JSON response body.
 * @returns {object|null}
 */
export function logEntryFromResponse(data) {
  return data && typeof data === "object" ? data : null;
}
