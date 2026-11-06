import apiLoggingFindLog from "./logging/find-log.mjs";
import apiDistBrowser from "./dist-browser/index.mjs";

/**
 * API route registry for tools-hub.
 * Each route is { testUrl, serve } and mounted under /api/<module>.
 */

const routes = [
  apiLoggingFindLog(),
  // Add more routes here as modules grow:
  ...apiDistBrowser(),
  // apiSomeModule(),
];

export default routes;
