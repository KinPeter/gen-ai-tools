import { stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { parseBodyBuffer } from "../../../utils/request.mjs";
import { parseMultipart } from "../../../utils/multipart.mjs";
import { stripBasename } from "../../../utils/file.mjs";
import { sendJSON, sendError } from "../../../utils/http.mjs";
import { createTestUrl } from "./test-url.mjs";

const POST_METHOD = "POST";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 1024 * 1024;
const UNAVAILABLE_ERROR = "Image uploads folder is unavailable";
const MULTIPART_TYPE = "multipart/form-data";

/**
 * Parse a Content-Type header into { type, boundary }. Returns
 * { type: null } for unparseable input — the caller rejects.
 */
function parseContentType(header) {
  if (typeof header !== "string") return { type: null, boundary: null };
  const [rawType, ...params] = header.split(";");
  const type = (rawType || "").trim().toLowerCase() || null;
  let boundary = null;
  for (const param of params) {
    const eq = param.indexOf("=");
    if (eq === -1) continue;
    if (param.slice(0, eq).trim().toLowerCase() !== "boundary") continue;
    boundary = param
      .slice(eq + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return { type, boundary };
}

/**
 * The first part that carries a filename — the file field can be named or
 * numbered by the browser/form author, so the field name is not assumed.
 */
function findFilePart(parts) {
  return parts.find((part) => part.filename && part.filename.trim()) || null;
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the first free dedupe name: `name`, then `stem-1.ext`, `stem-2.ext`, ...
 * `name` is guaranteed to be a validated basename — nothing here touches paths.
 */
async function uniqueFilename(folderRoot, name) {
  const ext = extname(name);
  const stem = ext ? name.slice(0, name.length - ext.length) : name;
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? name : `${stem}-${i}${ext}`;
    if (!(await fileExists(resolve(folderRoot, candidate)))) return candidate;
  }
}

/**
 * POST <prefix>/upload
 * Saves one uploaded file inside the folder named by the configured env var.
 * Filename is sanitized to a plain basename and deduped (-1, -2, ...) if taken.
 * 200 answers { "saved": "<filename>" }; 405 otherwise; 400 for a malformed
 * multipart body or a filename that cannot be sanitized; 413 for an oversized
 * file/body; 503 when the folder is missing, unavailable or not configured.
 *
 * @param {{ prefix: string, envVar: string, label: string }} ctx
 */
export function createUploadRoute(ctx) {
  const ROUTE_PATH = `${ctx.prefix}/upload`;
  const NOT_CONFIGURED_ERROR = `${ctx.envVar} is not configured`;

  async function readFolderRoot() {
    const folder = (process.env[ctx.envVar] || "").trim();
    if (!folder) return { error: 503, message: NOT_CONFIGURED_ERROR };
    const folderRoot = resolve(folder);
    try {
      const folderStat = await stat(folderRoot);
      if (!folderStat.isDirectory()) throw new Error("not a directory");
      return { folderRoot };
    } catch (err) {
      console.error(`${ctx.label}: folder unavailable:`, err.message);
      return { error: 503, message: UNAVAILABLE_ERROR };
    }
  }

  async function serve(req, res) {
    if ((req.method || "GET") !== POST_METHOD) {
      return sendError(res, 405, "Method Not Allowed", { Allow: POST_METHOD });
    }

    let body;
    try {
      body = await parseBodyBuffer(req, MAX_BODY_BYTES);
    } catch (err) {
      if (err.code === "BODY_TOO_LARGE") {
        return sendError(res, 413, "File too large");
      }
      throw err;
    }

    const { type, boundary } = parseContentType(req.headers["content-type"]);
    if (type !== MULTIPART_TYPE) {
      return sendError(res, 400, `Expected ${MULTIPART_TYPE}`);
    }
    if (!boundary) {
      return sendError(res, 400, "Missing multipart boundary");
    }

    let parts;
    try {
      parts = parseMultipart({ body, boundary });
    } catch (err) {
      return sendError(res, 400, `Malformed multipart body: ${err.message}`);
    }

    const file = findFilePart(parts);
    if (!file) {
      return sendError(res, 400, "No file in the upload");
    }
    if (file.content.length > MAX_FILE_BYTES) {
      return sendError(res, 413, "File too large");
    }

    const name = stripBasename(file.filename);
    if (!name) {
      return sendError(res, 400, "Invalid filename");
    }

    const { folderRoot, error, message } = await readFolderRoot();
    if (error) return sendError(res, error, message);

    const saved = await uniqueFilename(folderRoot, name);
    try {
      await writeFile(resolve(folderRoot, saved), file.content);
    } catch (err) {
      console.error(`${ctx.label}: cannot save file:`, err.message);
      return sendError(res, 503, UNAVAILABLE_ERROR);
    }

    return sendJSON(res, 200, { saved });
  }

  return { testUrl: createTestUrl(ROUTE_PATH), serve };
}
