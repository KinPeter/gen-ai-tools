import { useCallback, useEffect, useRef } from "react";

/**
 * Focus behaviour of the file browser list.
 *
 * - The list is focused automatically after navigating to a new folder.
 * - When the list receives keyboard focus, the ".." button gets it instead, so
 *   Enter/Backspace can walk up a level.
 */
export function useFileBrowserFocus(listRef, parentButtonRef, currentPath) {
  // Track the last currentPath to detect navigation. Refs are stable, so they
  // do not need to appear in the dependency arrays below.
  const lastPathRef = useRef(currentPath);

  // Auto-focus the list after navigating to a new folder. The initial load does
  // not count as a navigation because lastPathRef starts at currentPath.
  useEffect(() => {
    if (lastPathRef.current !== currentPath) {
      lastPathRef.current = currentPath;
      // Brief delay to allow the DOM to update after the re-render
      const timer = setTimeout(() => {
        if (listRef.current) {
          listRef.current.focus();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentPath]);

  // Focus the ".." button when the list receives keyboard focus
  const handleListFocus = useCallback(() => {
    if (currentPath && parentButtonRef.current) {
      parentButtonRef.current.focus();
    }
  }, [currentPath, parentButtonRef]);

  // Focus the ".." button programmatically
  const focusParentButton = useCallback(() => {
    if (parentButtonRef.current) {
      parentButtonRef.current.focus();
    }
  }, [parentButtonRef]);

  return { handleListFocus, focusParentButton };
}

export default useFileBrowserFocus;
