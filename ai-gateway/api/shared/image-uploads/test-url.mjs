/**
 * Build a testUrl for one endpoint path: matches the path and its
 * trailing-slash variant (query string stripped). Sub-paths are not matched —
 * they fall through to the server's 404.
 *
 * @param {string} path - e.g. "/api/my-image-uploads/list"
 */
export function createTestUrl(path) {
  return (url) => {
    const pathOnly = (url || "").split("?")[0];
    return pathOnly === path || pathOnly === `${path}/`;
  };
}
