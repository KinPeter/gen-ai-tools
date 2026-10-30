export const MIN_WIDTHS = [200, 300, 300]; // px for col 1, 2, 3

/**
 * Enforce minimum width constraint.
 * Pure function for unit testing.
 * @param {number} min - The minimum allowed width.
 * @param {number} current - The proposed new width.
 * @returns {number} The constrained width.
 */
export function enforceMinWidth(min, current) {
  return Math.max(min, current);
}

/**
 * Parse a stored width value from localStorage, falling back to a default.
 * @param {string|null} stored - The value from localStorage.
 * @param {number} fallback - Default value if stored is invalid.
 * @returns {number} Parsed or fallback width.
 */
export function parseStoredWidth(stored, fallback) {
  if (stored === null || stored === undefined) return fallback;
  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}
