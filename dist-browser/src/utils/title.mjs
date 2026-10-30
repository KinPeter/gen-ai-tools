/**
 * Build the topbar title. When the user is in a subfolder, append the path
 * with a trailing slash so the title reads "Dist Browser · path/to/folder/".
 * @param {string} path - Current folder path (empty for dist root).
 * @returns {string} Display title string.
 */
export function buildTitle(path) {
  if (!path) return "Dist Browser";
  return `Dist Browser · ${path}/`;
}
