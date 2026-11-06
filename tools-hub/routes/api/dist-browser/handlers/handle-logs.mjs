import fs from "node:fs";
import path from "node:path";
import { sendJSON } from "../../../../utils/index.mjs";

/**
 * GET handler for /api/dist-browser/logs
 * Returns all log entries from the logs directory.
 */
export function handleLogs(logsDir, req, res) {
  const allEntries = [];
  let fileCount = 0;

  if (!fs.existsSync(logsDir)) {
    return sendJSON(res, 200, { entries: [], fileCount: 0 });
  }

  try {
    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(logsDir, file);
      try {
        const data = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          allEntries.push(...parsed);
          fileCount++;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return sendJSON(res, 200, { entries: [], fileCount: 0 });
  }

  sendJSON(res, 200, { entries: allEntries, fileCount });
}
