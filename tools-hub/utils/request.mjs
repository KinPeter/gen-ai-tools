import { Buffer } from "node:buffer";

import { MAX_BODY_SIZE } from "./constants.mjs";

/**
 * Read a request body as text (async), capped at `MAX_BODY_SIZE`. Decoding
 * happens once at the end: a chunk boundary lands wherever the socket likes,
 * and `chunk.toString()` on a partial multi-byte character would answer
 * `U+FFFD` instead of the character — visible to any caller that echoes the
 * body back, such as `api/comfy/validate-input`.
 */
export function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}
