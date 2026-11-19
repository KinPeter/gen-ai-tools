import apiLoggingFindLog from "./logging/find-log.mjs";
import apiLoggingSearchLogs from "./logging/search-logs.mjs";
import apiComfyValidateInput from "./comfy/validate-input.mjs";
import apiDistBrowser from "./dist-browser/index.mjs";

/**
 * API route registry for tools-hub.
 * Each route is { testUrl, serve } and mounted under /api/<module>.
 */

const routes = [
  apiLoggingFindLog(),
  apiLoggingSearchLogs(),
  apiComfyValidateInput(),
  // Add more routes here as modules grow:
  ...apiDistBrowser(),
  // apiSomeModule(),
];

export default routes;
