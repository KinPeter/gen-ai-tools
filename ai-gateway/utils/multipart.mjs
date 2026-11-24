/**
 * Minimal multipart/form-data parser — no dependencies, binary-safe.
 *
 * Splits on the exact `--boundary` delimiter and extracts each part's
 * content-disposition metadata and raw content. It intentionally does NOT
 * reconstruct anything by decoding: binary bytes are preserved as Buffers.
 *
 * Known limitation: a part whose binary content embeds the literal boundary
 * delimiter would be miscounted. Browsers generate random boundaries, so this
 * cannot happen in practice with real uploads.
 */

const CRLF = Buffer.from("\r\n");
const BLANK_LINE = Buffer.from("\r\n\r\n");

/**
 * Locate every occurrence of the delimiter in the buffer.
 */
function findBoundaries(buffer, delim) {
  const positions = [];
  let pos = buffer.indexOf(delim);
  while (pos !== -1) {
    positions.push(pos);
    pos = buffer.indexOf(delim, pos + delim.length);
  }
  return positions;
}

/**
 * Parse one header block into a lowercase-keyed object.
 */
function parseHeaders(block) {
  const headers = {};
  for (const line of block.toString("utf8").split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key && value) headers[key] = value;
  }
  return headers;
}

/**
 * Parse a Content-Disposition header into { name, filename }.
 * Handles quoted ("...") and unquoted values; RFC 2231 encoded names are not
 * decoded (browsers send the plain, quoted form for normal uploads).
 */
function parseContentDisposition(value) {
  const out = {};
  const segments = String(value || "").split(";");
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    let val = segment.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    if (key === "name" || key === "filename") out[key] = val;
  }
  return out;
}

/**
 * Parse one part's raw bytes (everything between two boundaries, CRLF-stripped).
 * Returns null when the part is not a well-formed header block + content.
 */
function parsePart(raw) {
  let part = raw;
  if (part.slice(0, 2).equals(CRLF)) part = part.slice(2);
  if (part.slice(-2).equals(CRLF)) part = part.slice(0, part.length - 2);

  const blank = part.indexOf(BLANK_LINE);
  if (blank === -1) return null;

  const headers = parseHeaders(part.slice(0, blank));
  const disposition = parseContentDisposition(headers["content-disposition"]);
  if (!disposition.name && !disposition.filename) return null;

  return {
    name: disposition.name || "",
    filename: disposition.filename || "",
    content: part.slice(blank + BLANK_LINE.length),
  };
}

/**
 * Split a raw multipart body into parts.
 *
 * @param {Buffer} body - the entire request body
 * @param {string} boundary - the boundary value from Content-Type
 * @returns {Array<{ name: string, filename: string, content: Buffer }>}
 * Throws Error for structural violations.
 */
export function parseMultipart({ body, boundary }) {
  if (typeof boundary !== "string" || !boundary.trim()) {
    throw new Error("Missing multipart boundary");
  }
  const delim = Buffer.from(`--${boundary}`);
  const boundaries = findBoundaries(body, delim);
  if (boundaries.length < 1) {
    throw new Error("Unbalanced multipart body");
  }

  const parts = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const raw = body.slice(boundaries[i] + delim.length, boundaries[i + 1]);
    const part = parsePart(raw);
    if (part) parts.push(part);
  }
  return parts;
}
