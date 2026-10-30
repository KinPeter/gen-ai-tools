import { useEffect } from "react";

/**
 * Keep the highlighted row visible. The list is a scroll container, so a
 * selection that moves outside the viewport (arrow keys, a delete) would
 * otherwise highlight a row the user cannot see.
 *
 * `listRef` is a ref and therefore stable, so only the index needs to trigger
 * the effect.
 *
 * @param {object} listRef - Ref to `.file-browser-list`.
 * @param {number} selectedIndex - Highlighted row index.
 */
export function useSelectedEntryScroll(listRef, selectedIndex) {
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedNode = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      if (selectedNode) {
        selectedNode.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);
}

export default useSelectedEntryScroll;
