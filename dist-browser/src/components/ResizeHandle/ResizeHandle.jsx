import { useCallback, useRef } from "react";
import "./ResizeHandle.css";

export function ResizeHandle({ index, width, onStartDrag }) {
  const handleRef = useRef(null);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // Use the handle element's rendered position as start X
        const rect = handleRef.current?.getBoundingClientRect();
        onStartDrag(index, rect?.left ?? 0);
      }
    },
    [index, onStartDrag],
  );

  return (
    <div
      ref={handleRef}
      className="resize-handle"
      onMouseDown={(e) => {
        e.preventDefault();
        onStartDrag(index, e.clientX);
      }}
      role="separator"
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    />
  );
}

export default ResizeHandle;
