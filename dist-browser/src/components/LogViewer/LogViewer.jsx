import "./LogViewer.css";
import { colorizeJsonText } from "../../utils/colorize-json-text.mjs";

/**
 * Log Viewer column: displays the generation log entry fetched for the
 * selected image as a theme-aware code block with vertical centering and
 * scrollable overflow.
 *
 * @param {object} props
 * @param {object} props.log - Log lookup state for the selected image, as
 *   returned by `useImageLog`: `{ selected, entry, loading, error }`.
 */
export function LogViewer({ log = {} }) {
  const { selected = false, entry = null, loading = false, error = null } = log;

  // ── Empty state ────────────────────────────────────────────────────────

  if (!selected) {
    return (
      <div className="log-viewer-empty">
        <span className="log-viewer-empty-text">No log entry</span>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="log-viewer-empty" role="status" aria-busy="true">
        <span className="log-viewer-loading-text">Loading log…</span>
      </div>
    );
  }

  // ── Lookup failed state ────────────────────────────────────────────────

  if (error) {
    return (
      <div className="log-viewer-empty" role="alert">
        <span className="log-viewer-error">Log lookup failed: {error}</span>
      </div>
    );
  }

  // ── No log found state ─────────────────────────────────────────────────

  if (!entry) {
    return (
      <div className="log-viewer-empty">
        <span className="log-viewer-no-match">
          No generation log found for this image.
        </span>
      </div>
    );
  }

  // ── Log entry rendering ────────────────────────────────────────────────

  const logText = JSON.stringify(entry, null, 2);

  return (
    <div className="log-viewer-content">
      <pre className="log-viewer-code">
        <code>{colorizeJsonText(logText)}</code>
      </pre>
    </div>
  );
}

export default LogViewer;
