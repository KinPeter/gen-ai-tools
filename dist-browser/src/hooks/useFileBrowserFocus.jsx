import { useEffect, useRef } from "react";

/**
 * Restores keyboard focus to the file browser list after the listing is
 * re-created (folder navigation, delete, refresh): the rows that had focus are
 * removed from the DOM and the browser falls back to <body>, so keyboard
 * navigation silently stops working.
 *
 * A document-level focusin listener tracks whether the keyboard was inside the
 * list. When the listing changes and focus was inside the list before it, the
 * list is re-focused with `preventScroll` — without it the browser auto-scrolls
 * the focused element into view, jumping the viewport back to the top of the
 * list (the scroll jump that removed the auto-focus hook). Focus deliberately
 * moved to another control (Refresh, the viewer) is left alone.
 *
 * @param {object} listRef - Ref to `.file-browser-list`.
 * @param {string} currentPath - Folder being listed; changes when the listing moves.
 * @param {Array<object>} entries - Current listing; identity changes on every fetch.
 */
export function useFileBrowserFocus(listRef, currentPath, entries) {
  const wasFocusedInsideListRef = useRef(false);

  useEffect(() => {
    const trackFocus = (event) => {
      const list = listRef.current;
      wasFocusedInsideListRef.current = Boolean(
        list && event.target && list.contains(event.target),
      );
    };
    document.addEventListener("focusin", trackFocus);
    return () => document.removeEventListener("focusin", trackFocus);
  }, [listRef]);

  useEffect(() => {
    if (!wasFocusedInsideListRef.current) return;
    const list = listRef.current;
    if (!list || list.contains(document.activeElement)) return;
    list.focus({ preventScroll: true });
  }, [currentPath, entries, listRef]);
}

export default useFileBrowserFocus;
