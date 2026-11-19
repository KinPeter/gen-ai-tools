import { searchLogs } from "../../../logging/mongodb/search-logs.mjs";
import {
  DbUnavailableError,
  getImageLogCollection,
  parseBody,
  sendError,
  sendJSON,
} from "../../utils/index.mjs";
import { parseSearchBody, SearchRequestError } from "./parse-search-body.mjs";

/** Route path this endpoint answers. */
const ROUTE_PATH = "/api/logging/search-logs";
const POST_METHOD = "POST";

/**
 * Searches the collection the server opened at startup — handlers never close
 * that shared connection.
 *
 * @param {object} filters - filter object understood by buildQuery.
 * @param {number|null} limit - maximum number of results, null for no limit.
 * @returns {Promise<object[]>} matching entries with `_id` removed.
 */
export async function serverSearchLogs(filters, limit) {
  return searchLogs(filters, { collection: getImageLogCollection() }, limit);
}

/** Matches /api/logging/search-logs, its trailing slash and any sub-path. */
function testUrl(url) {
  const pathOnly = (url || "").split("?")[0];

  return pathOnly === ROUTE_PATH || pathOnly.startsWith(`${ROUTE_PATH}/`);
}

/** Reading and decoding the body is the client's job: report the reason. */
function badRequestMessage(err) {
  return err instanceof SearchRequestError
    ? err.message
    : `Invalid request body: ${err.message}`;
}

/**
 * POST /api/logging/search-logs. Body: `{ <filters>, limit }`, every field
 * optional. 200 answers the matching entries as a JSON array; 400 rejects an
 * unreadable body or unknown filters, 405 rejects any other method naming
 * POST in `Allow`, 503 answers when the database is unavailable and 500 when
 * the query itself fails.
 */
async function serve(req, res) {
  if ((req.method || "GET") !== POST_METHOD) {
    return sendError(res, 405, "Method Not Allowed", { Allow: POST_METHOD });
  }

  let request;
  try {
    request = parseSearchBody(await parseBody(req));
  } catch (err) {
    return sendError(res, 400, badRequestMessage(err));
  }

  try {
    const entries = await serverSearchLogs(request.filters, request.limit);
    return sendJSON(res, 200, entries);
  } catch (err) {
    console.error(`Error searching logs: ${err.message}`);
    const status = err instanceof DbUnavailableError ? 503 : 500;
    return sendError(res, status, err.message);
  }
}

export default function apiLoggingSearchLogs() {
  return { testUrl, serve };
}
