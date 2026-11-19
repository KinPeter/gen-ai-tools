import { parseBody, sendError, sendJSON } from "../../utils/index.mjs";
import { validateYamlText } from "./validate-yaml.mjs";

/** Route path this endpoint answers. */
const ROUTE_PATH = "/api/comfy/validate-input";
const POST_METHOD = "POST";

/** Reported when the caller sent no body at all. */
const EMPTY_BODY_ERROR =
  "Empty request body — send the YAML input file as the body";

/** Matches /api/comfy/validate-input, its trailing slash and any sub-path. */
function testUrl(url) {
  const pathOnly = (url || "").split("?")[0];

  return pathOnly === ROUTE_PATH || pathOnly.startsWith(`${ROUTE_PATH}/`);
}

/**
 * Read the request body as YAML text. `Content-Type` is never looked at:
 * `curl --data-binary @file.yaml` sends `application/x-www-form-urlencoded`
 * unless told otherwise, so a header check would reject the plainest call.
 *
 * @param {import("node:http").IncomingMessage} req - request being served.
 * @returns {Promise<string>} the body text.
 * @throws {Error} when the body is empty or larger than `MAX_BODY_SIZE`. That
 *   second failure lands on `serve` as a 400, but `parseBody` destroys the
 *   request in the same tick it rejects, so a real socket usually closes
 *   before the answer reaches the client — the same as every other POST route
 *   here, and the reason `test/tools-hub/api/logging/search-logs.test.mjs`
 *   calls its own oversize response mock-only.
 */
async function readInputText(req) {
  const raw = await parseBody(req);

  if (raw === "") throw new Error(EMPTY_BODY_ERROR);

  return raw;
}

/**
 * POST /api/comfy/validate-input. Body: the full YAML text of a batch input
 * file, sent raw (`--data-binary`) or with any `Content-Type`. 200 answers
 * `{"valid":true}` or `{"valid":false,"error":"<first reason>"}` — an invalid
 * YAML is the verdict, not a rejected request. 400 rejects a body that is
 * empty or over the size cap, 405 any other method naming POST in `Allow`.
 */
async function serve(req, res) {
  if ((req.method || "GET") !== POST_METHOD) {
    return sendError(res, 405, "Method Not Allowed", { Allow: POST_METHOD });
  }

  let text;
  try {
    text = await readInputText(req);
  } catch (err) {
    return sendError(res, 400, `Invalid request body: ${err.message}`);
  }

  return sendJSON(res, 200, validateYamlText(text));
}

export default function apiComfyValidateInput() {
  return { testUrl, serve };
}
