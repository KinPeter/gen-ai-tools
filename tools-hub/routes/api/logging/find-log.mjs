import {
  findLogEntry,
  normalizeFilename,
} from "../../../../logging/mongodb/find-log.mjs";
import { getImageLogConnection } from "../../../../logging/mongodb/client.mjs";

/**
 * Server-compatible wrapper that uses the core functions from
 * logging/mongodb/find-log.mjs (findLogEntry + getImageLogConnection)
 * to avoid the CLI-specific process.exit(1) call in findWithConnection.
 */
export async function serverFindLog(input) {
  const strippedFilename = normalizeFilename(input);
  if (!strippedFilename) return null;

  const connection = await getImageLogConnection();
  try {
    const entry = await findLogEntry(strippedFilename, connection);
    return entry;
  } finally {
    if (connection.client) {
      await connection.client.close();
    }
  }
}

/**
 * Test whether the request URL matches this route.
 * Matches /api/logging/find-log and /api/logging/find-log/.
 */
function testUrl(url) {
  // Match /api/logging/find-log, /api/logging/find-log/,
  // and /api/logging/find-log?query (strip query string for comparison).
  const pathOnly = url.split("?")[0];
  return (
    pathOnly === "/api/logging/find-log" ||
    url.startsWith("/api/logging/find-log/")
  );
}

/**
 * Serve a request for the find-log API endpoint.
 * GET /api/logging/find-log?filename=<image>
 */
async function serve(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const filename = url.searchParams.get("filename") || "";

  if (!filename) {
    res.statusCode = 400;
    res.writeHead(400, { "content-type": "application/json" });
    res.write(JSON.stringify({ error: "Missing filename parameter" }));
    res.end();
    return;
  }

  try {
    const entry = await serverFindLog(filename);
    if (entry === null) {
      res.statusCode = 404;
      res.writeHead(404, { "content-type": "application/json" });
      res.write(
        JSON.stringify({ error: `No log entry found for: ${filename}` }),
      );
      res.end();
      return;
    }
    res.statusCode = 200;
    res.writeHead(200, { "content-type": "application/json" });
    res.write(JSON.stringify(entry));
    res.end();
  } catch (err) {
    console.error(`Error finding log entry: ${err.message}`);
    res.statusCode = 500;
    res.writeHead(500, { "content-type": "application/json" });
    res.write(JSON.stringify({ error: err.message }));
    res.end();
  }
}

export default function apiLoggingFindLog() {
  return { testUrl, serve };
}
