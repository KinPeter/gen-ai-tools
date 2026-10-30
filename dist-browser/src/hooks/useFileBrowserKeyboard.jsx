import { useCallback } from "react";
import { isFolderEntry, isParentEntry, joinFolderPath } from "../utils/entries";
import { parentFolderPath } from "../utils/last-folder";

/**
 * Keyboard navigation for the file browser list: ArrowUp/ArrowDown walk the
 * rows (wrapping), Enter opens the selected folder or the ".." row, Backspace
 * goes up one level, Delete trashes the selected entry and Home jumps to the
 * first row. Nothing is actuated while a listing is still loading, and any
 * keyboard move drops the mouse hover highlight.
 */
export function useFileBrowserKeyboard({
  entries,
  selectedIndex,
  currentPath,
  loading,
  setHoveredIndex,
  focusParentButton,
  onNavigate,
  onSelect,
  onDelete,
}) {
  return useCallback(
    (event) => {
      if (loading) return;

      const listLength = entries.length;
      if (listLength === 0) return;

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          setHoveredIndex(null);
          const next = (selectedIndex + 1) % listLength;
          // Notify the parent of the new selection
          onSelect?.(entries[next] || null);
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          setHoveredIndex(null);
          const prev = (selectedIndex - 1 + listLength) % listLength;
          onSelect?.(entries[prev] || null);
          break;
        }
        case "Enter": {
          event.preventDefault();
          const entry = entries[selectedIndex];
          if (!entry) return;
          // If parent (".."), navigate up
          if (isParentEntry(entry)) {
            onNavigate?.(parentFolderPath(currentPath));
            return;
          }
          // If folder, navigate into it
          if (isFolderEntry(entry)) {
            onNavigate?.(joinFolderPath(currentPath, entry.name));
          }
          // Images: already selected via onSelect, no double action
          break;
        }
        case "Backspace": {
          event.preventDefault();
          onNavigate?.(parentFolderPath(currentPath));
          break;
        }
        case "Delete": {
          event.preventDefault();
          const entry = entries[selectedIndex];
          if (entry && !isParentEntry(entry)) {
            onDelete?.(entry);
          }
          break;
        }
        case "Home": {
          event.preventDefault();
          if (currentPath && entries.length > 0) {
            setHoveredIndex(null);
            onSelect?.(entries[0] || null);
            focusParentButton();
          }
          break;
        }
        default:
          break;
      }
    },
    [
      entries,
      selectedIndex,
      currentPath,
      loading,
      setHoveredIndex,
      focusParentButton,
      onNavigate,
      onSelect,
      onDelete,
    ],
  );
}

export default useFileBrowserKeyboard;
