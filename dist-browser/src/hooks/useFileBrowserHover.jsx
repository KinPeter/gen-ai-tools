import { useEffect, useState } from "react";

/**
 * Hover highlight for the file browser list.
 *
 * Entries are replaced after a delete or a refresh, so an index-based hover
 * highlight would otherwise point at a different (never hovered) row: the
 * highlight is dropped whenever the list itself changes.
 *
 * @param {Array<object>} entries - Current listing.
 * @returns {{ hoveredIndex: number|null, setHoveredIndex: (index: number|null) => void }}
 */
export function useFileBrowserHover(entries) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    setHoveredIndex(null);
  }, [entries]);

  return { hoveredIndex, setHoveredIndex };
}

export default useFileBrowserHover;
