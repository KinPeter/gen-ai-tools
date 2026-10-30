import "./LogViewer.css";
import { matchLogEntry } from "../../utils/log-entry.mjs";
import { colorizeJsonText } from "../../utils/colorize-json-text.mjs";

/**
 * Log Viewer column: displays a generation log entry as a theme-aware code
 * block with vertical centering and scrollable overflow.
 *
 * @param {object} props
 * @param {object|null} props.entry - Selected image listing entry.
 * @param {Array<object>} props.logEntries - Cached log entries.
 * @param {boolean} props.logsLoading - Whether logs are still being fetched.
 */
export function LogViewer({ entry, logEntries, logsLoading }) {
  const isEmpty = !entry;
  const logEntry = matchLogEntry(entry, logEntries);
  const noMatch = !isEmpty && !logEntry;

  // ── Empty state ────────────────────────────────────────────────────────

  if (isEmpty) {
    return (
      <div className="log-viewer-empty">
        <span className="log-viewer-empty-text">No log entry</span>
      </div>
    );
  }

  // ── No match state ─────────────────────────────────────────────────────

  if (noMatch) {
    return (
      <div className="log-viewer-empty">
        <span className="log-viewer-no-match">
          No generation log found for this image.
        </span>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────

  if (logsLoading) {
    return (
      <div className="log-viewer-empty">
        <span className="log-viewer-loading-text">Loading log…</span>
      </div>
    );
  }

  // ── Log entry rendering ────────────────────────────────────────────────

  const logText = JSON.stringify(logEntry, null, 2);

  return (
    <div className="log-viewer-content">
      <pre className="log-viewer-code">
        <code>{colorizeJsonText(logText)}</code>
      </pre>
    </div>
  );
}

export default LogViewer;
