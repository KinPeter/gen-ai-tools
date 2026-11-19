import { Buffer } from "node:buffer";

/**
 * Send a JSON response. `extraHeaders` carries headers the status needs beyond
 * the content ones — `{ Allow: "POST" }` on a 405, for example. The content
 * headers always win over anything passed in.
 */
export function sendJSON(res, statusCode, data, extraHeaders = {}) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    ...extraHeaders,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Send an error JSON response. `extraHeaders` works as in sendJSON.
 */
export function sendError(res, statusCode, message, extraHeaders) {
  sendJSON(res, statusCode, { error: message }, extraHeaders);
}
