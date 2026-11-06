/**
 * Build the encoded image source URL.
 * Returns `null` when imagePath is falsy.
 * @param {string|null} imagePath
 * @returns {string|null}
 */
export function buildImageUrl(imagePath) {
  if (!imagePath) return null;
  return `/api/dist-browser/images/${encodeURIComponent(imagePath)}`;
}
