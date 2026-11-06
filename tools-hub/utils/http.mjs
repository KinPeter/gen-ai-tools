import { Buffer } from "node:buffer";

/**
 * Send a JSON response.
 */
export function sendJSON(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Send an error JSON response.
 */
export function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}
