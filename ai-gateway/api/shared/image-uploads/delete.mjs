import { unlink, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { parseBody } from "../../../utils/request.mjs";
import { isPlainBasename } from "../../../utils/file.mjs";
import { sendJSON, sendError } from "../../../utils/http.mjs";
import { createTestUrl } from "./test-url.mjs";

const POST_METHOD = "POST";
const UNAVAILABLE_ERROR = "Image uploads folder is unavailable";

/**
 * Parse the request body into a sanitized list of filenames.
 * Throws Error(message) for any shape violation — mapped to a 400.
 */
async function readFiles(req) {
  const raw = await parseBody(req);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Malformed JSON body");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected an object with a files array");
  }

  if (!Array.isArray(parsed.files)) {
    throw new Error("Missing files array");
  }

  if (parsed.files.some((name) => typeof name !== "string" || !name.trim())) {
    throw new Error("Files entries must be non-empty strings");
  }

  return parsed.files.map((name) => name.trim());
}

/**
 * POST <prefix>/delete
 * Deletes the files named in the JSON body ({ "files": [...] }) inside the
 * folder named by the configured env var. Only plain files — no traversal,
 * no symlink handling. 200 answers { "deleted": N } where N is the number of
 * files actually deleted; entries that are invalid names or fail to delete
 * (not found, directory, permission) are skipped, not counted. 405 for any
 * other method (Allow: POST); 400 for a malformed body; 503 when the folder
 * is missing, unreadable or not configured.
 *
 * @param {{ prefix: string, envVar: string, label: string }} ctx
 */
export function createDeleteRoute(ctx) {
  const ROUTE_PATH = `${ctx.prefix}/delete`;
  const NOT_CONFIGURED_ERROR = `${ctx.envVar} is not configured`;

  async function serve(req, res) {
    if ((req.method || "GET") !== POST_METHOD) {
      return sendError(res, 405, "Method Not Allowed", { Allow: POST_METHOD });
    }

    let files;
    try {
      files = await readFiles(req);
    } catch (err) {
      return sendError(res, 400, `Invalid request body: ${err.message}`);
    }

    const folder = (process.env[ctx.envVar] || "").trim();
    if (!folder) {
      return sendError(res, 503, NOT_CONFIGURED_ERROR);
    }

    const folderRoot = resolve(folder);

    try {
      const folderStat = await stat(folderRoot);
      if (!folderStat.isDirectory()) {
        throw new Error("not a directory");
      }
    } catch (err) {
      // Details stay server-side: the absolute path must not leak to the client.
      console.error(`${ctx.label}: folder unavailable:`, err.message);
      return sendError(res, 503, UNAVAILABLE_ERROR);
    }

    let deleted = 0;
    for (const name of files) {
      if (!isPlainBasename(name)) {
        console.error(
          `${ctx.label}: skipping invalid filename: ${JSON.stringify(name)}`,
        );
        continue;
      }

      const target = resolve(folderRoot, name);
      const rootWithSep = folderRoot.endsWith(sep)
        ? folderRoot
        : folderRoot + sep;
      if (target !== folderRoot && !target.startsWith(rootWithSep)) {
        console.error(
          `${ctx.label}: skipping out-of-folder filename: ${JSON.stringify(name)}`,
        );
        continue;
      }

      try {
        await unlink(target);
        deleted++;
      } catch (err) {
        console.error(
          `${ctx.label}: skipping ${JSON.stringify(name)}: ${err.message}`,
        );
      }
    }

    return sendJSON(res, 200, { deleted });
  }

  return { testUrl: createTestUrl(ROUTE_PATH), serve };
}
