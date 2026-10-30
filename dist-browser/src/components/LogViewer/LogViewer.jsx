import { isImageFile } from "../../utils/is-image";
import "./LogViewer.css";

/**
 * Log Viewer column: a placeholder until the log API is connected. Renders
 * nothing unless the selection is an image.
 *
 * @param {object} props
 * @param {object|null} props.entry - Selected listing entry.
 */
export function LogViewer({ entry }) {
  if (!isImageFile(entry)) return null;

  return (
    <div className="log-viewer-placeholder">
      <p>Log for: {entry.name}</p>
      <p className="log-viewer-note">(Task 5: connect to log API)</p>
    </div>
  );
}

export default LogViewer;
