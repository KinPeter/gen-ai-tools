import { readdir } from "node:fs/promises";

import { sendJSON, sendError } from "../../../utils/http.mjs";
import { createTestUrl } from "./test-url.mjs";

const GET_METHOD = "GET";
const UNAVAILABLE_ERROR = "Image uploads folder is unavailable";

/**
 * GET <prefix>/list
 * Lists plain filenames found in the folder named by the configured env var,
 * sorted alphabetically. Only plain files are listed — directories, symlinks
 * and anything else are excluded. 200 answers { "files": [...] } ([] when
 * the folder is empty); 405 for any other method (Allow: GET); 503 when the
 * env var is missing/empty or the folder cannot be read.
 *
 * @param {{ prefix: string, envVar: string, label: string }} ctx
 */
export function createListRoute(ctx) {
  const ROUTE_PATH = `${ctx.prefix}/list`;
  const NOT_CONFIGURED_ERROR = `${ctx.envVar} is not configured`;

  async function serve(req, res) {
    if ((req.method || "GET") !== GET_METHOD) {
      return sendError(res, 405, "Method Not Allowed", { Allow: GET_METHOD });
    }

    const folder = (process.env[ctx.envVar] || "").trim();
    if (!folder) {
      return sendError(res, 503, NOT_CONFIGURED_ERROR);
    }

    try {
      const entries = await readdir(folder, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
      return sendJSON(res, 200, { files });
    } catch (err) {
      // Details stay server-side: the absolute path must not leak to the client.
      console.error(`${ctx.label}: cannot list folder:`, err.message);
      return sendError(res, 503, UNAVAILABLE_ERROR);
    }
  }

  return { testUrl: createTestUrl(ROUTE_PATH), serve };
}
