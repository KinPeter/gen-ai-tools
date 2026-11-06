import fs from "node:fs";
import path from "node:path";
import {
  normalizePathSegment,
  parseBody,
  resolveBase,
  sendError,
  sendJSON,
} from "../../../../utils/index.mjs";

/**
 * POST handler for /api/dist-browser/trash
 * Moves files/folders to .trash/ under baseDir.
 */
export async function handleTrash(baseDir, req, res) {
  let body;
  try {
    const raw = await parseBody(req);
    body = JSON.parse(raw);
  } catch {
    return sendError(res, 400, "Invalid JSON body");
  }

  if (!body || !Array.isArray(body.paths) || body.paths.length === 0) {
    return sendError(res, 400, "Missing or malformed 'paths' array");
  }

  const trashDir = path.join(baseDir, ".trash");

  try {
    fs.mkdirSync(trashDir, { recursive: true });
  } catch {
    return sendError(res, 500, "Failed to create trash directory");
  }

  const errors = [];
  const now = new Date().toISOString().replace(/[:.]/g, "");

  for (const rel of body.paths) {
    const normalized = normalizePathSegment(rel);
    const { resolved, safe } = resolveBase(baseDir, normalized);

    if (!safe) {
      errors.push({ path: rel, error: "Path escapes allowed directory" });
      continue;
    }

    if (!fs.existsSync(resolved)) {
      errors.push({ path: rel, error: "Not found" });
      continue;
    }

    const name = path.basename(resolved);
    let dest = path.join(trashDir, name);

    if (fs.existsSync(dest)) {
      const ext = path.extname(name);
      const baseName = ext
        ? name.replace(
            new RegExp(ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
            "",
          )
        : name;
      dest = path.join(trashDir, `${baseName}.${now}${ext}`);
    }

    const { safe: destSafe } = resolveBase(trashDir, name);
    if (!destSafe) {
      errors.push({ path: rel, error: "Path escapes allowed directory" });
      continue;
    }

    try {
      fs.renameSync(resolved, dest);
    } catch (err) {
      errors.push({ path: rel, error: err.message || "Move failed" });
    }
  }

  sendJSON(res, 200, { ok: errors.length === 0, errors });
}
