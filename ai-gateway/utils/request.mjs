import { Buffer } from "node:buffer";

/** 1 MB — same cap as the tools-hub body reader. */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Read a request body as text (async), capped at `MAX_BODY_SIZE`. Decoding
 * happens once at the end: a chunk boundary lands wherever the socket likes,
 * and `chunk.toString()` on a partial multi-byte character would answer
 * `U+FFFD` instead of the character.
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

/**
 * Read a request body as a Buffer, capped at `maxBytes`. The body is drained
 * up to the cap and the rest is discarded (not buffered) — a client uploading
 * more than the cap is answered 413 after the drain, never OOM'd.
 *
 * Rejects with an Error whose `code` is "BODY_TOO_LARGE" when the cap is
 * exceeded. Binary bytes are never decoded or re-encoded.
 */
export function parseBodyBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(
          Object.assign(new Error("Request body too large"), {
            code: "BODY_TOO_LARGE",
          }),
        );
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}
