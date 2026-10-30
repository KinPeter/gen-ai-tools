/**
 * Single source of truth for "is this an image the browser can display?".
 * Shared by the server (dist-browser/server.mjs), the file listing and the
 * Layout viewer so the three never disagree about supported extensions.
 */
export const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

export function isImageFile(entry) {
  return (
    Boolean(entry) && entry.type === "file" && IMAGE_EXTENSIONS.has(entry.ext)
  );
}
